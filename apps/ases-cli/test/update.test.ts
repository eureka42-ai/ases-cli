import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { installedFromNpmGlobal, latestVersion, runUpdate } from '../src/update.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'aer-update-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const registry = (latest: string) => (async (url: string) => {
  expect(url).toBe('https://registry.npmjs.org/@eureka42-ai%2faer');
  return new Response(JSON.stringify({ 'dist-tags': { latest } }), { status: 200 });
}) as unknown as typeof fetch;
const GLOBAL_BIN = path.join('/usr/local/lib/node_modules/@eureka42-ai/aer/bin/ases.js');
function fakeNpm(): { cli: string; log: string } {
  const log = path.join(dir, `npm-${Math.random()}.log`);
  const cli = path.join(dir, `fake-npm-${Math.random()}.mjs`);
  writeFileSync(cli, `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)));\nconsole.log('added 1 package');\n`);
  return { cli, log };
}

describe('ases update (PHASE-18, TAR-0088)', () => {
  it('reads dist-tags.latest from the registry', async () => {
    expect(await latestVersion({ fetchImpl: registry('1.2.0') })).toBe('1.2.0');
    const f = path.join(dir, 'reg.json');
    writeFileSync(f, JSON.stringify({ 'dist-tags': { latest: '9.9.9' } }));
    expect(await latestVersion({ registry: `file://${f}` })).toBe('9.9.9');
  });
  it('knows whether it was installed by npm -g', () => {
    expect(installedFromNpmGlobal(GLOBAL_BIN)).toBe(true);
    expect(installedFromNpmGlobal('C:\\Users\\u\\AppData\\Roaming\\npm\\node_modules\\@eureka42-ai\\aer\\bin\\ases.js')).toBe(true);
    expect(installedFromNpmGlobal('/home/u/ases-cli/apps/ases-cli/bin/ases.js')).toBe(false);
  });
  it('reports UP_TO_DATE when latest equals current', async () => {
    const r = await runUpdate({ current: '1.1.0', check: false, running: 0, binPath: GLOBAL_BIN, fetchImpl: registry('1.1.0') });
    expect(r).toMatchObject({ status: 'UP_TO_DATE', from: '1.1.0' });
    expect(r.message).toMatch(/já está na versão mais nova/);
  });
  it('--check reports AVAILABLE without installing', async () => {
    const npm = fakeNpm();
    const r = await runUpdate({ current: '1.1.0', check: true, running: 0, binPath: GLOBAL_BIN, fetchImpl: registry('1.2.0'), npm: { cli: npm.cli, node: process.execPath } });
    expect(r).toMatchObject({ status: 'AVAILABLE', from: '1.1.0', to: '1.2.0' });
    expect(() => readFileSync(npm.log)).toThrow();
  });
  it('installs the exact latest version without a shell', async () => {
    const npm = fakeNpm();
    const r = await runUpdate({ current: '1.1.0', check: false, running: 0, binPath: GLOBAL_BIN, fetchImpl: registry('1.2.0'), npm: { cli: npm.cli, node: process.execPath } });
    expect(r).toMatchObject({ status: 'UPDATED', from: '1.1.0', to: '1.2.0' });
    expect(JSON.parse(readFileSync(npm.log, 'utf8'))).toEqual(['install', '-g', '@eureka42-ai/aer@1.2.0']);
  });
  it('refuses while tasks are running', async () => {
    expect(await runUpdate({ current: '1.1.0', check: false, running: 2, binPath: GLOBAL_BIN, fetchImpl: registry('1.2.0') })).toMatchObject({ status: 'REFUSED', message: expect.stringMatching(/pare as tarefas antes \(\/parar\)/) });
  });
  it('refuses when not installed from npm global', async () => {
    expect(await runUpdate({ current: '1.1.0', check: false, running: 0, binPath: '/repo/apps/ases-cli/bin/ases.js', fetchImpl: registry('1.2.0') })).toMatchObject({ status: 'REFUSED', message: expect.stringMatching(/git pull && npm run build/) });
  });
  it('network failure leaves everything as is and shows the error', async () => {
    const r = await runUpdate({ current: '1.1.0', check: false, running: 0, binPath: GLOBAL_BIN, fetchImpl: (async () => { throw new Error('getaddrinfo ENOTFOUND registry.npmjs.org'); }) as unknown as typeof fetch });
    expect(r).toMatchObject({ status: 'FAILED' });
    expect(r.message).toMatch(/ENOTFOUND/);
  });
  it('an older version on the registry is never installed', async () => {
    expect((await runUpdate({ current: '1.2.0', check: false, running: 0, binPath: GLOBAL_BIN, fetchImpl: registry('1.1.0') })).status).toBe('UP_TO_DATE');
  });
});
