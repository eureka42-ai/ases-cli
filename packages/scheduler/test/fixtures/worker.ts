// Processo real para TAR-0025: node --conditions=source worker.ts <db> <modo> [args]
import { ProjectStore } from '@aer/persistence';
import { tick } from '../../src/index.ts';

const [file, mode, ...args] = process.argv.slice(2);
const store = ProjectStore.open(file!, { id: 'prj_race000001', name: 'race' }, { actor: `w-${process.pid}` });
if (mode === 'tick') {
  const r = tick(store, { ownerId: `w-${process.pid}`, ttlMs: 60_000, maxParallel: Number(args[0]) });
  console.log(JSON.stringify(r.reserved.map((x) => x.taskId)));
} else if (mode === 'reserve-and-die') {
  const r = tick(store, { ownerId: `w-${process.pid}`, ttlMs: Number(args[0]), maxParallel: 1 });
  const t = r.reserved[0]!;
  store.transitionTaskFenced(t.taskId, 'RUNNING', t.fencingToken);
  store.startAttempt(t.taskId, t.fencingToken, { providerId: 'simulator' });
  console.log(t.taskId);
  process.exit(9); // morre com lease ativo e attempt RUNNING
}
store.close();
