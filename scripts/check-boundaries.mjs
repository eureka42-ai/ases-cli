#!/usr/bin/env node
// Lint de arquitetura (§3.3, §3.6, §12.2): direção de imports entre pacotes e proibição de shell.
// AER-REQ-006, AER-REQ-226, AER-REQ-109/165.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OS_SPECIFIC = ['@aer/platform-macos', '@aer/platform-windows', '@aer/platform-linux'];
const PORTABLE = ['contracts', 'core', 'scheduler', 'provider-sdk', 'persistence', 'event-log', 'tui-shared'];
const UI_ALLOWED = ['tui-shared', 'branding', 'ases-cli', 'ases-tar'];
const UI_LIBS = ['ink', 'react'];

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;
const SHELL_TRUE_RE = /\bshell\s*:\s*true\b/;
const EXEC_IMPORT_RE = /import\s*\{[^}]*\bexec(?:Sync)?\b[^}]*\}\s*from\s*['"](?:node:)?child_process['"]/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx|mts|cts|js|mjs)$/.test(name)) yield full;
  }
}

const pkgOf = (spec) => spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/');

export function checkBoundaries(root) {
  const violations = [];
  const units = ['packages', 'apps'].flatMap((d) => {
    try { return readdirSync(path.join(root, d)).map((pkg) => [pkg, path.join(root, d, pkg, 'src')]); } catch { return []; }
  });
  for (const [pkg, src] of units) {
    try { statSync(src); } catch { continue; }
    for (const file of walk(src)) {
      const rel = path.relative(root, file);
      const text = readFileSync(file, 'utf8');
      const add = (rule, detail) => violations.push({ file: rel, rule, detail });
      for (const m of text.matchAll(IMPORT_RE)) {
        const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
        const target = pkgOf(spec);
        if (spec.startsWith('.')) continue;
        if (pkg === 'contracts' && target.startsWith('@aer/')) add('contracts-imports-nothing-internal', spec);
        if (PORTABLE.includes(pkg) && OS_SPECIFIC.includes(target)) add('portable-imports-os-specific', spec);
        if (pkg.startsWith('platform-') && pkg !== 'platform-core' && OS_SPECIFIC.includes(target) && target !== `@aer/${pkg}`) add('platform-cross-import', spec);
        if (!UI_ALLOWED.includes(pkg) && UI_LIBS.includes(target)) add('ui-lib-outside-tui', spec);
        if (spec === 'node:sqlite' && pkg !== 'persistence') add('sqlite-outside-persistence', spec); // ADR-0002
      }
      if (SHELL_TRUE_RE.test(text)) add('no-shell-true', 'shell: true');
      if (EXEC_IMPORT_RE.test(text)) add('no-child-process-exec', 'exec/execSync import');
    }
  }
  return violations;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] ?? '.');
  const v = checkBoundaries(root);
  for (const x of v) console.error(`${x.file}: ${x.rule} (${x.detail})`);
  console.log(v.length ? `boundaries: ${v.length} violation(s)` : 'boundaries: OK');
  process.exit(v.length ? 1 : 0);
}
