#!/usr/bin/env node
// Agente SIMULADO do AER (§7.3): processo local determinístico, sem rede, sem IA e sem custo.
// A saída depende só de (cenário, tarefa, conteúdo das instruções). Escreve NDJSON no stdout em pedaços
// propositalmente cortados no meio da linha, para exercitar o parser incremental (AER-REQ-104).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const SIM_VERSION = '1.0.0';
const SCENARIOS = ['ok', 'fail', 'hang', 'approval', 'auth-expired', 'rate-limit', 'garbage', 'escape', 'review', 'review-write', 'chat'];

const { values } = parseArgs({ options: { version: { type: 'boolean' }, scenario: { type: 'string' }, task: { type: 'string' }, instructions: { type: 'string' } } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// pipes são assíncronos no macOS: espera o flush antes de seguir (e antes de process.exit)
const out = (s) => new Promise((r) => process.stdout.write(s, r));
async function emit(event) {
  const line = `${JSON.stringify(event)}\n`;
  const cut = Math.max(1, Math.floor(line.length / 2));
  await out(line.slice(0, cut));
  await sleep(5);
  await out(line.slice(cut));
}
if (values.version) {
  await out(`ases-simulator ${SIM_VERSION}\n`);
  process.exit(0);
}
const scenario = values.scenario ?? 'ok';
if (!SCENARIOS.includes(scenario) || !/^TAR-\d{4,}$/.test(values.task ?? '') || !values.instructions) {
  process.stderr.write('usage: sim-agent --scenario <name> --task TAR-XXXX --instructions <file>\n');
  process.exit(64);
}
const taskId = values.task;
const digest = createHash('sha256').update(readFileSync(values.instructions)).digest('hex');

const forever = () => new Promise(() => setInterval(() => undefined, 1 << 30));

await emit({ type: 'status', status: 'STARTED', detail: `SIMULATED ${scenario} ${taskId}` });
// no chat a única mensagem visível é a resposta (ela vira o texto da principal)
if (scenario !== 'chat') await emit({ type: 'message', text: `SIMULATED: lendo instruções (sha256 ${digest.slice(0, 12)})`, visibleToUser: true });

switch (scenario) {
  case 'chat': {
    // PHASE-18: principal simulada. Responde à última "## Mensagem do usuário" das instruções
    const text = readFileSync(values.instructions, 'utf8');
    const i = text.lastIndexOf('## Mensagem do usuário\n');
    const msg = (i < 0 ? '' : text.slice(i + '## Mensagem do usuário\n'.length)).trim();
    if (/^RESUMO/.test(msg)) {
      await emit({ type: 'message', text: `SIMULATED: resumo — ${msg.split('\n').filter((l) => l.startsWith('- TAR-')).length} tarefas`, visibleToUser: true });
    } else if (/\bedite\b/i.test(msg)) {
      const rel = 'SIMULATED/CHAT.md';
      mkdirSync('SIMULATED', { recursive: true });
      writeFileSync(path.join('SIMULATED', 'CHAT.md'), `# editado pela principal SIMULADA\n\n${msg.slice(0, 200)}\n`);
      await emit({ type: 'file_change', relativePath: rel, kind: 'modify' });
      await emit({ type: 'message', text: `SIMULATED: editei ${rel}`, visibleToUser: true });
    } else if (/\b(tarefas|divida)\b/i.test(msg)) {
      const plan = { tasks: [1, 2, 3].map((n) => ({ title: `Parte ${n}`, instructions: `SIMULATED: faça a parte ${n} de: ${msg.slice(0, 120)}`, kind: 'code', ...(n === 3 ? { dependsOn: [1] } : {}) })) };
      await emit({ type: 'message', text: `SIMULATED: proposta abaixo\n\n\`\`\`aer-plan\n${JSON.stringify(plan, null, 2)}\n\`\`\``, visibleToUser: true });
    } else {
      await emit({ type: 'message', text: `SIMULATED: entendi — ${msg.slice(0, 60)}`, visibleToUser: true });
    }
    process.exit(0);
  }
  case 'ok': {
    const rel = `SIMULATED/${taskId}.md`;
    await emit({ type: 'tool_call', name: 'write_file', safeArguments: { path: rel } });
    mkdirSync('SIMULATED', { recursive: true });
    writeFileSync(path.join('SIMULATED', `${taskId}.md`), `# ${taskId} (SIMULATED)\n\nSaída determinística do simulador do AER; nenhuma IA foi usada.\n\ninstructions-sha256: ${digest}\n`);
    await emit({ type: 'file_change', relativePath: rel, kind: 'create' });
    await emit({ type: 'tool_result', name: 'write_file', success: true, safeSummary: `wrote ${rel}` });
    await emit({ type: 'message', text: 'SIMULATED: concluído', visibleToUser: true });
    process.exit(0);
  }
  case 'review':
    // revisor bem-comportado: só lê e responde (PHASE-11)
    await emit({ type: 'message', text: 'SIMULATED: APROVADO — revisão determinística, nenhuma IA foi usada.', visibleToUser: true });
    process.exit(0);
  case 'review-write':
    // revisor que tenta escrever: o AER precisa recusar a revisão e descartar a escrita (AER-REQ-187)
    writeFileSync('REVISOR-ESCREVEU.md', 'não devia\n');
    await emit({ type: 'message', text: 'SIMULATED: APROVADO (mas escrevi um arquivo)', visibleToUser: true });
    process.exit(0);
  case 'fail':
    await emit({ type: 'error', code: 'TASK_FAILED', userMessage: 'SIMULATED: falha determinística' });
    process.exit(1);
  case 'auth-expired':
    await emit({ type: 'error', code: 'AUTH_EXPIRED', userMessage: 'SIMULATED: sessão do provider expirada' });
    process.exit(2);
  case 'rate-limit':
    await emit({ type: 'error', code: 'RATE_LIMITED', userMessage: 'SIMULATED: 429 limite de uso do provider' });
    process.exit(2);
  case 'garbage':
    await out('{"type":"message","text": isto não é JSON\n');
    await out(`${JSON.stringify({ type: 'teleport', to: 'mars' })}\n`);
    process.exit(0); // saída 0 com stream inválido: o AER não pode tratar como sucesso (§7.6)
  case 'escape':
    await emit({ type: 'file_change', relativePath: '../fora-da-worktree.txt', kind: 'create' });
    process.exit(0);
  case 'approval':
    await emit({ type: 'approval_request', operationHash: createHash('sha256').update(`${taskId}:rm-build`).digest('hex'), description: 'SIMULATED: apagar a pasta build/' });
    await forever(); // espera uma decisão que só chega pelo AER (cancelamento nesta fase)
    break;
  case 'hang': {
    // neto que também fica pendurado: o cancelamento precisa encerrar a árvore inteira (AER-REQ-106)
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1 << 30)'], { stdio: 'ignore' });
    await emit({ type: 'status', status: 'CHILD_SPAWNED', detail: String(child.pid) });
    await forever();
  }
}
