import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, StoreError, openDatabase } from '../src/index.ts';
import { tempDir } from './helpers.ts';

const dir = tempDir();

describe('migrations (TAR-0006)', () => {
  it('applies on an empty file with WAL and FKs on', () => {
    const { db, journalMode, schemaVersion, backupPath } = openDatabase(path.join(dir, 'a.sqlite'));
    expect(journalMode).toBe('wal');
    expect(schemaVersion).toBe(1);
    expect(backupPath).toBeUndefined();
    expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    db.close();
  });

  it('reopening is idempotent (no backup, same version)', () => {
    const file = path.join(dir, 'a.sqlite');
    const r = openDatabase(file);
    expect(r).toMatchObject({ schemaVersion: 1, backupPath: undefined });
    r.db.close();
  });

  it('backs up and verifies before migrating an existing database (AER-REQ-018)', () => {
    const file = path.join(dir, 'a.sqlite');
    const extra = [...MIGRATIONS, { version: 2, name: 'test-extra', sql: 'CREATE TABLE extra (x INTEGER);' }];
    const r = openDatabase(file, extra);
    expect(r.schemaVersion).toBe(2);
    expect(r.backupPath && existsSync(r.backupPath)).toBe(true);
    r.db.close();
    const backup = openDatabase(r.backupPath!, MIGRATIONS); // backup continua na v1 e abre sem migrar
    expect(backup.schemaVersion).toBe(1);
    backup.db.close();
  });

  it('refuses a database newer than the code (AER-REQ-010, C18)', () => {
    expect(() => openDatabase(path.join(dir, 'a.sqlite'), MIGRATIONS)).toThrow(expect.objectContaining({ code: 'DB_SCHEMA_TOO_NEW' }) as StoreError);
  });

  it('rolls back a failing migration and leaves the version untouched', () => {
    const file = path.join(dir, 'b.sqlite');
    openDatabase(file).db.close();
    const broken = [...MIGRATIONS, { version: 2, name: 'broken', sql: 'CREATE TABLE ok_t (x); CREATE TABLE ok_t (x);' }];
    expect(() => openDatabase(file, broken)).toThrow();
    const r = openDatabase(file);
    expect(r.schemaVersion).toBe(1);
    expect(r.db.prepare("SELECT count(*) c FROM sqlite_master WHERE name = 'ok_t'").get()).toEqual({ c: 0 });
    r.db.close();
  });

  it('enforces CHECK constraints on states and priority', () => {
    const { db } = openDatabase(':memory:');
    db.exec("INSERT INTO projects VALUES ('p','n','t'); INSERT INTO phases VALUES ('p','PHASE-01',1,'f','PLANNED',1,'t','t');");
    expect(() => db.exec("INSERT INTO tasks (project_id,id,phase_id,title,state,created_at,updated_at) VALUES ('p','TAR-0001','PHASE-01','x','DONE','t','t')")).toThrow(/CHECK/);
    expect(() => db.exec("INSERT INTO tasks (project_id,id,phase_id,title,state,priority,created_at,updated_at) VALUES ('p','TAR-0001','PHASE-01','x','PLANNED',101,'t','t')")).toThrow(/CHECK/);
    expect(() => db.exec("INSERT INTO tasks (project_id,id,phase_id,title,state,created_at,updated_at) VALUES ('p','TAR-0001','PHASE-99','x','PLANNED','t','t')")).toThrow(/FOREIGN KEY/);
    db.close();
  });
});
