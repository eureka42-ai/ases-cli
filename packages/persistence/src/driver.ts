import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

// ADR-0002: único ponto do repositório que carrega node:sqlite.
let ctor: typeof DatabaseSyncType | undefined;

function loadDriver(): typeof DatabaseSyncType {
  if (ctor) return ctor;
  const original = process.emitWarning;
  // suprime só o ExperimentalWarning do SQLite (ADR-0002 §2); demais avisos passam
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const text = typeof warning === 'string' ? warning : warning.message;
    if (/sqlite/i.test(text)) return;
    return (original as (...a: unknown[]) => void).call(process, warning, ...rest);
  }) as typeof process.emitWarning;
  try {
    ctor = (createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')).DatabaseSync;
  } finally {
    process.emitWarning = original;
  }
  return ctor;
}

export type Database = DatabaseSyncType;
export const openSqlite = (file: string): Database => new (loadDriver())(file);

export function sqliteVersion(): string {
  const db = openSqlite(':memory:');
  try {
    return String((db.prepare('SELECT sqlite_version() AS v').get() as { v: unknown }).v);
  } finally {
    db.close();
  }
}
