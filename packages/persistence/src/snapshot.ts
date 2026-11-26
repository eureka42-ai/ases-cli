import { mkdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openSqlite } from './driver.ts';

/**
 * 1.4.0: cópia consistente do banco para levar o projeto a outra máquina (GitHub ou nuvem). `VACUUM INTO` lê uma
 * transação só, então funciona com o engine aberto (WAL) e nunca copia uma escrita pela metade, ao contrário do sync
 * de pasta (iCloud/Drive), que corrompeu o banco em 22/11/2026.
 */
export function snapshotDatabase(dbFile: string, outFile: string): void {
  mkdirSync(path.dirname(outFile), { recursive: true });
  const tmp = `${outFile}.${process.pid}.tmp`;
  rmSync(tmp, { force: true });
  const db = openSqlite(dbFile);
  try {
    db.exec(`VACUUM INTO '${tmp.replaceAll("'", "''")}'`);
  } finally {
    db.close();
  }
  renameSync(tmp, outFile);
}
