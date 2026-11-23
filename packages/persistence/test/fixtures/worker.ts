// Processo filho real para TAR-0010. Executado com: node --conditions=source worker.ts <db> <modo> [args]
import { ProjectStore, StoreError } from '../../src/index.ts';

const [file, mode, ...args] = process.argv.slice(2);
if (!file || !mode) throw new Error('usage: worker.ts <db> <mode> [args]');
const store = ProjectStore.open(file, { id: 'prj_test000001', name: 'teste' }, { actor: `worker-${process.pid}` });

if (mode === 'append') {
  for (let i = 0; i < Number(args[0]); i++) store.appendEvent({ eventType: 'TestRunStarted', payload: { pid: process.pid, i } });
  console.log('DONE');
} else if (mode === 'race') {
  const [taskId, version] = args;
  try {
    store.transitionTask(taskId!, 'READY', Number(version));
    console.log('WON');
  } catch (err) {
    console.log(err instanceof StoreError ? err.code : 'ERROR');
  }
} else if (mode === 'crash') {
  store.tx(() => {
    store.createPhase('nunca confirmada');
    console.log('IN_TX');
    process.exit(42); // morte do processo antes do COMMIT
  });
}
store.close();
