import { existsSync } from 'node:fs';
import path from 'node:path';

/** npm-cli.js do Node em uso, para rodar o npm sem shell (no Windows o `npm` do PATH é um .cmd). */
export function npmCli(env: Readonly<Record<string, string | undefined>> = process.env, execPath: string = process.execPath): string {
  if (env.npm_execpath?.endsWith('.js')) return env.npm_execpath;
  const candidates = [path.join(path.dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'), path.join(path.dirname(execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')];
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error(`npm-cli.js não encontrado perto de ${execPath}`);
  return found;
}
