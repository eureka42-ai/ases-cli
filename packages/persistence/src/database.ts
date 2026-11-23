import { existsSync } from 'node:fs';
import { openSqlite, type Database } from './driver.ts';
import { StoreError } from './errors.ts';
import { MIGRATIONS, type Migration } from './migrations.ts';

export interface OpenResult {
  db: Database;
  journalMode: string;
  schemaVersion: number;
  backupPath: string | undefined;
}

const scalar = (db: Database, sql: string): unknown => Object.values(db.prepare(sql).get() ?? {})[0];
const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;

function backup(db: Database, file: string, version: number): string {
  const target = `${file}.bak-v${version}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  db.exec(`VACUUM INTO ${quote(target)}`);
  const check = openSqlite(target);
  try {
    if (scalar(check, 'PRAGMA integrity_check') !== 'ok' || scalar(check, 'PRAGMA user_version') !== version) {
      throw new StoreError('BACKUP_FAILED', `backup verification failed: ${target}`);
    }
  } finally {
    check.close();
  }
  return target;
}

/** Abre (ou cria) o banco, aplica pragmas §6.4 e migrações pendentes com backup prévio (AER-REQ-018). */
export function openDatabase(file: string, migrations: readonly Migration[] = MIGRATIONS): OpenResult {
  const existed = file !== ':memory:' && existsSync(file);
  const db = openSqlite(file);
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    const journalMode = file === ':memory:' ? 'memory' : String(scalar(db, 'PRAGMA journal_mode = WAL'));
    const current = Number(scalar(db, 'PRAGMA user_version'));
    const latest = migrations.at(-1)?.version ?? 0;
    if (current > latest) {
      throw new StoreError('DB_SCHEMA_TOO_NEW', `database schema v${current} is newer than this AER (v${latest}); upgrade AER`);
    }
    const pending = migrations.filter((m) => m.version > current);
    const backupPath = existed && current > 0 && pending.length ? backup(db, file, current) : undefined;
    for (const m of pending) {
      db.exec('BEGIN IMMEDIATE');
      try {
        // relê dentro do lock: outro processo pode ter migrado enquanto esperávamos
        if (Number(scalar(db, 'PRAGMA user_version')) >= m.version) {
          db.exec('COMMIT');
          continue;
        }
        db.exec(m.sql);
        db.exec(`PRAGMA user_version = ${m.version}`);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    }
    return { db, journalMode, schemaVersion: Number(scalar(db, 'PRAGMA user_version')), backupPath };
  } catch (err) {
    db.close();
    throw err;
  }
}
