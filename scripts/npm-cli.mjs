import { existsSync } from 'node:fs';
import path from 'node:path';

/** npm-cli.js do node em uso (sem shell; no Windows `npm` é um .cmd). */
export function npmCli() {
  if (process.env.npm_execpath?.endsWith('.js')) return process.env.npm_execpath;
  const candidates = [path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'), path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')];
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error(`npm-cli.js não encontrado perto de ${process.execPath}`);
  return found;
}
