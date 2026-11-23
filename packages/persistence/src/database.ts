import { randomBytes } from 'node:crypto';
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

const isBusy = (err: unknown) => /database is locked|SQLITE_BUSY/i.test(String((err as Error)?.message ?? err));
const sleepSync = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Abrir/migrar com vários processos ao mesmo tempo: a troca de journal_mode e o primeiro BEGIN IMMEDIATE podem
 * devolver BUSY sem passar pelo busy_timeout (visto no CI Windows, run 45095965102). Repete com espera curta até 10 s.
 */
export function withBusyRetry<T>(fn: () => T, budgetMs = 10_000): T {
  const t0 = Date.now();
  for (let delay = 10; ; delay = Math.min(delay * 2, 250)) {
    try {
      return fn();
    } catch (err) {
      if (!isBusy(err) || Date.now() - t0 > budgetMs) throw err;
      sleepSync(delay + Math.floor(Math.random() * delay));
    }
  }
}
const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;

function backup(db: Database, file: string, version: number): string {
  // pid + aleatório: dois processos migrando no mesmo milissegundo escreviam no MESMO arquivo e o VACUUM INTO de um
  // colidia com o do outro ("table projects already exists", reproduzido localmente e no CI run 45191096847)
  const target = `${file}.bak-v${version}-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}-${randomBytes(3).toString('hex')}`;
  db.exec(`VACUUM INTO ${quote(target)}`);
  const check = openSqlite(target);
  try {
    // >= e não ===: outro processo pode ter migrado entre a leitura da versão e o VACUUM INTO (corrida vista no CI,
    // run 45096707722); a migração deste processo relê a versão sob lock e vira no-op, e o backup segue íntegro
    if (scalar(check, 'PRAGMA integrity_check') !== 'ok' || Number(scalar(check, 'PRAGMA user_version')) < version) {
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
    // só pede WAL se ainda não for (a troca exige lock exclusivo; o modo WAL persiste no arquivo)
    const journalMode = file === ':memory:' ? 'memory'
      : withBusyRetry(() => (String(scalar(db, 'PRAGMA journal_mode')) === 'wal' ? 'wal' : String(scalar(db, 'PRAGMA journal_mode = WAL'))));
    const current = Number(scalar(db, 'PRAGMA user_version'));
    const latest = migrations.at(-1)?.version ?? 0;
    if (current > latest) {
      throw new StoreError('DB_SCHEMA_TOO_NEW', `database schema v${current} is newer than this AER (v${latest}); upgrade AER`);
    }
    const pending = migrations.filter((m) => m.version > current);
    const backupPath = existed && current > 0 && pending.length ? backup(db, file, current) : undefined;
    for (const m of pending) {
      withBusyRetry(() => db.exec('BEGIN IMMEDIATE'));
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
