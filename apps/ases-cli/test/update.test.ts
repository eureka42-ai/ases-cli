import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { autoUpdateCheck, installedFromNpmGlobal, latestVersion, runUpdate } from '../src/update.ts';

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
    expect(JSON.parse(readFileSync(npm.log, 'utf8'))).toEqual(['install', '-g', '@eureka42-ai/aer@1.2.0', '--prefer-online']); // sem o cache velho do npm (ETARGET logo após publicar)
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

describe('atualização automática (PHASE-28, TAR-0099)', () => {
  const now = Date.parse('2026-11-27T12:00:00Z');
  const base = { current: '1.7.0', binPath: GLOBAL_BIN, now };
  it('by default finds the new version and schedules the install for when the user exits', async () => {
    const r = await autoUpdateCheck({ ...base, fetchImpl: registry('1.8.0') });
    expect(r).toMatchObject({ to: '1.8.0', install: true, checkedAt: '2026-11-27T12:00:00.000Z' });
    expect(r?.message).toMatch(/quando você sair/);
  });
  it('mode "avisar" only notifies', async () => {
    expect(await autoUpdateCheck({ ...base, mode: 'avisar', fetchImpl: registry('1.8.0') })).toMatchObject({ to: '1.8.0', install: false, message: expect.stringMatching(/\/atualizar/) });
  });
  it('up to date: records the check, says nothing', async () => {
    expect(await autoUpdateCheck({ ...base, fetchImpl: registry('1.7.0') })).toEqual({ checkedAt: '2026-11-27T12:00:00.000Z' });
  });
  it('no network: silent, tries again next time', async () => {
    expect(await autoUpdateCheck({ ...base, fetchImpl: (async () => { throw new Error('offline'); }) as unknown as typeof fetch })).toBeUndefined();
  });
  it('does not touch the network when off, when checked in the last 24h, or when running from the repository', async () => {
    const boom = (async () => { throw new Error('não devia consultar'); }) as unknown as typeof fetch;
    expect(await autoUpdateCheck({ ...base, mode: 'off', fetchImpl: boom })).toBeUndefined();
    expect(await autoUpdateCheck({ ...base, checkedAt: '2026-11-27T01:00:00.000Z', fetchImpl: boom })).toBeUndefined();
    expect(await autoUpdateCheck({ ...base, binPath: '/repo/apps/ases-cli/bin/ases.js', fetchImpl: boom })).toBeUndefined();
    expect(await autoUpdateCheck({ ...base, checkedAt: '2026-11-26T11:00:00.000Z', fetchImpl: registry('1.7.0') })).toBeDefined();
  });
});
