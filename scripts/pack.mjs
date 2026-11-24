#!/usr/bin/env node
// Monta o pacote npm ÚNICO do AER (AER-REQ-004/232) a partir dos `dist` já compilados (`npm run build`), sem bundler e
// sem dependência nova. O tarball é AUTOCONTIDO: os pacotes internos (@aer/*) e o fecho transitivo de zod/ink/react,
// copiados do node_modules já instalado (lockfile), vão embutidos; instalar não precisa de rede. Nada é publicado.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { npmCli } from './npm-cli.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(repo, '.pack', 'aer');
const SKIP = new Set(['src', 'test', 'node_modules', 'tsconfig.build.json', 'tsconfig.json', 'tsconfig.build.tsbuildinfo']);
const workspaces = ['packages', 'apps'].flatMap((d) => readdirSync(path.join(repo, d)).map((n) => path.join(repo, d, n))).filter((d) => existsSync(path.join(d, 'package.json')));

rmSync(path.join(repo, '.pack'), { recursive: true, force: true });
mkdirSync(path.join(out, 'node_modules', '@aer'), { recursive: true });
const external = {};
const bundled = [];
for (const dir of workspaces) {
  const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  if (!existsSync(path.join(dir, 'dist'))) throw new Error(`${pkg.name}: dist/ ausente; rode \`npm run build\` antes`);
  const dest = path.join(out, 'node_modules', ...pkg.name.split('/'));
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry) || entry.endsWith('.tsbuildinfo')) continue;
    cpSync(path.join(dir, entry), path.join(dest, entry), { recursive: true });
  }
  // o export "source" (TS) só serve aos testes do monorepo; no pacote fica só o JS compilado
  if (pkg.exports?.['.']) pkg.exports['.'] = { types: pkg.exports['.'].types?.replace('./src/', './dist/').replace(/\.ts$/, '.d.ts'), default: pkg.exports['.'].default };
  for (const [k, v] of Object.entries(pkg.dependencies ?? {})) if (!k.startsWith('@aer/')) external[k] = v;
  writeFileSync(path.join(dest, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  bundled.push(pkg.name);
}
// fecho transitivo das dependências externas (dependencies + peers presentes), na versão do lockfile do monorepo
const closure = new Set();
const visit = (name) => {
  if (closure.has(name)) return;
  const dir = path.join(repo, 'node_modules', ...name.split('/'));
  if (!existsSync(path.join(dir, 'package.json'))) throw new Error(`${name} não está em node_modules (rode npm ci)`);
  closure.add(name);
  const p = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  for (const d of Object.keys({ ...p.dependencies, ...p.peerDependencies })) if (existsSync(path.join(repo, 'node_modules', ...d.split('/'), 'package.json'))) visit(d);
  for (const d of Object.keys(p.optionalDependencies ?? {})) if (existsSync(path.join(repo, 'node_modules', ...d.split('/'), 'package.json'))) visit(d);
};
for (const name of Object.keys(external)) visit(name);
for (const name of closure) cpSync(path.join(repo, 'node_modules', ...name.split('/')), path.join(out, 'node_modules', ...name.split('/')), { recursive: true, dereference: true });

// licenças de terceiros embutidos: só permissivas; o aviso de cada um vai no THIRD_PARTY_LICENSES.md do pacote (MIT exige)
const PERMISSIVE = /^\(?(MIT|ISC|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|0BSD|BlueOak-1\.0\.0|CC0-1\.0)( OR (MIT|ISC|Apache-2\.0|CC0-1\.0))*\)?$/;
const notices = [...closure].sort().map((name) => {
  const dir = path.join(repo, 'node_modules', ...name.split('/'));
  const p = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  if (typeof p.license !== 'string' || !PERMISSIVE.test(p.license)) throw new Error(`${name}@${p.version}: licença ${JSON.stringify(p.license)} fora da lista permissiva; revise antes de embutir`);
  const files = readdirSync(dir).filter((f) => /^(licen[cs]e|copying|notice)/i.test(f));
  const text = files.map((f) => readFileSync(path.join(dir, f), 'utf8').trim()).join('\n\n');
  return `## ${name}@${p.version} (${p.license})\n\n${text ? `\`\`\`text\n${text}\n\`\`\`` : `Sem arquivo de licença no pacote publicado; licença declarada no package.json: ${p.license}.${p.repository ? ` Repositório: ${typeof p.repository === 'string' ? p.repository : p.repository.url}.` : ''}`}`;
});

const versions = readFileSync(path.join(repo, 'packages/contracts/src/versions.ts'), 'utf8');
const version = /app: '([^']+)'/.exec(versions)?.[1] ?? '0.0.0';
mkdirSync(path.join(out, 'bin'));
writeFileSync(path.join(out, 'bin', 'ases.js'), "#!/usr/bin/env node\nimport '@aer/app-ases/dist/main.js';\n");
writeFileSync(path.join(out, 'bin', 'ases-tar.js'), "#!/usr/bin/env node\nimport '@aer/app-ases-tar/dist/main.js';\n");
cpSync(path.join(repo, 'fontes'), path.join(out, 'fontes'), { recursive: true });
cpSync(path.join(repo, 'LICENSE'), path.join(out, 'LICENSE'));
writeFileSync(path.join(out, 'THIRD_PARTY_LICENSES.md'), `# Licenças de terceiros embutidos no @eureka42/aer\n\n${notices.length} pacotes, copiados do lockfile do monorepo.\n\n${notices.join('\n\n')}\n`);
cpSync(path.join(repo, 'docs', 'INSTALL.md'), path.join(out, 'README.md'));
const root = JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8'));
writeFileSync(path.join(out, 'package.json'), `${JSON.stringify({
  name: '@eureka42/aer', version, description: 'Eureka42 · ASES Engineering Runtime (AER): ases + ases-tar', type: 'module', license: root.license,
  engines: root.engines, bin: { ases: 'bin/ases.js', 'ases-tar': 'bin/ases-tar.js' },
  // o npm só embute bundleDependencies que também estão em dependencies; as @aer/* nunca são buscadas no registro
  dependencies: { ...external, ...Object.fromEntries(bundled.map((n) => [n, '0.0.0'])) }, bundleDependencies: [...bundled, ...Object.keys(external)].sort(),
  files: ['bin', 'fontes', 'LICENSE', 'THIRD_PARTY_LICENSES.md', 'README.md'],
}, null, 2)}\n`);
// AER-REQ-250: o pacote não leva fontes tipográficas (nem proprietárias nem quaisquer) nem as imagens de estudo de marca
const walkAll = (d) => readdirSync(d).flatMap((n) => (statSync(path.join(d, n)).isDirectory() ? walkAll(path.join(d, n)) : [path.join(d, n)]));
const fonts = walkAll(out).filter((f) => /\.(ttf|otf|woff2?|eot)$/i.test(f));
if (fonts.length) throw new Error(`arquivos de fonte tipográfica no pacote: ${fonts.map((f) => path.relative(out, f)).join(', ')}`);
// shortcut: o lockfile do pacote não é gerado; as 3 dependências externas são fixadas por versão exata
for (const [k, v] of Object.entries(external)) if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error(`${k}@${v}: versão não exata`);
const tgz = execFileSync(process.execPath, [npmCli(), 'pack', '--silent', '--pack-destination', path.join(repo, '.pack')], { cwd: out, encoding: 'utf8' }).trim().split('\n').at(-1);
const file = path.join(repo, '.pack', tgz);
console.log(JSON.stringify({ tarball: path.relative(repo, file).split(path.sep).join('/'), bytes: statSync(file).size, internal: bundled.length, thirdParty: closure.size, dependencies: external }));
