#!/usr/bin/env node
// Ferramenta INTERINA de estado .ases/ do próprio AER (TAR-0004), sem dependências.
// shortcut: HISTORY.jsonl é escrito direto aqui porque o event store SQLite ainda não existe;
// na PHASE-02 este histórico é importado como seed e passa a ser espelho derivado do banco (§6.1).
//
// Uso:
//   node scripts/ases-dev.mjs init                       cria .ases/ sem sobrescrever nada
//   node scripts/ases-dev.mjs set <PHASE-XX|TAR-XXXX> <STATE> [--note txt] [--evidence path]...
//   node scripts/ases-dev.mjs refresh                    regenera STATUS.md, TRACEABILITY.csv e bloco AUTO do HANDOFF.md
//   node scripts/ases-dev.mjs verify                     confere seq contínua, eventId único e sha256 dos payloads
// Opções: --root <dir> (padrão: cwd)  --plan <arquivo> (padrão: scripts/aer-plan.json)
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Espelha packages/contracts/src/states.ts (este script roda sem build).
const TASK_STATES = ['DRAFT', 'PLANNED', 'READY', 'RESERVED', 'RUNNING', 'PAUSED', 'VERIFYING', 'REVIEW', 'REWORK',
  'APPROVED', 'MERGING', 'CONFLICT', 'BLOCKED', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED', 'COMPLETED'];
const PHASE_STATES = ['DRAFT', 'PLANNED', 'READY', 'RUNNING', 'BLOCKED', 'VERIFYING', 'COMPLETED', 'CANCELLED', 'FAILED'];
const ACTOR = 'ases-dev-interim';
const AUTO_BEGIN = '<!-- AUTO:BEGIN (gerado por scripts/ases-dev.mjs refresh; não editar) -->';
const AUTO_END = '<!-- AUTO:END -->';

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = { positional: [], evidence: [], note: undefined, root: process.cwd(), plan: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${a} requires a value`);
      return v;
    };
    if (a === '--root') opts.root = path.resolve(next());
    else if (a === '--plan') opts.plan = path.resolve(next());
    else if (a === '--note') opts.note = next();
    else if (a === '--evidence') opts.evidence.push(next());
    else opts.positional.push(a);
  }
  opts.plan ??= path.join(path.dirname(fileURLToPath(import.meta.url)), 'aer-plan.json');
  return opts;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function store(root) {
  const A = path.join(root, '.ases');
  const abs = (rel) => path.join(A, rel);

  // escrita atômica: temp no mesmo diretório + rename, nunca trunca um arquivo válido (§4.3)
  function writeAtomic(rel, content) {
    const file = abs(rel);
    mkdirSync(path.dirname(file), { recursive: true });
    if (existsSync(file) && readFileSync(file, 'utf8') === content) return false;
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, content, { encoding: 'utf8', mode: 0o644 });
    renameSync(tmp, file);
    return true;
  }
  const writeIfAbsent = (rel, content) => (existsSync(abs(rel)) ? false : writeAtomic(rel, content));
  const readJson = (rel) => JSON.parse(readFileSync(abs(rel), 'utf8'));
  const json = (v) => `${JSON.stringify(v, null, 2)}\n`;

  function history() {
    if (!existsSync(abs('HISTORY.jsonl'))) return [];
    return readFileSync(abs('HISTORY.jsonl'), 'utf8').split('\n').filter(Boolean).map((l, i) => {
      try {
        return JSON.parse(l);
      } catch {
        throw new Error(`HISTORY.jsonl line ${i + 1} is not valid JSON`);
      }
    });
  }

  function appendEvent(eventType, { phaseId = null, taskId = null, payload = {} } = {}) {
    const events = history();
    const projectId = existsSync(abs('MANIFEST.json')) ? readJson('MANIFEST.json').projectId : null;
    const now = new Date().toISOString();
    const event = {
      schemaVersion: 1, eventId: randomUUID(), seq: (events.at(-1)?.seq ?? 0) + 1, projectId, phaseId, taskId,
      attemptId: null, eventType, occurredAt: now, observedAt: now, actor: ACTOR, payload,
      redactionLevel: 'SAFE', payloadSha256: sha256(canonical(payload)),
    };
    mkdirSync(A, { recursive: true });
    // shortcut: append sem lock; único escritor (sessão de desenvolvimento) até o motor com lease existir.
    appendFileSync(abs('HISTORY.jsonl'), `${JSON.stringify(event)}\n`, 'utf8');
    return event;
  }

  return { A, abs, writeAtomic, writeIfAbsent, readJson, json, history, appendEvent };
}

function taskStatusFiles(s) {
  const out = [];
  const phasesDir = s.abs('phases');
  if (!existsSync(phasesDir)) return out;
  for (const phase of readdirSync(phasesDir).sort()) {
    for (const entry of readdirSync(path.join(phasesDir, phase)).sort()) {
      if (/^TAR-\d{4,}$/.test(entry)) out.push(`phases/${phase}/${entry}/STATUS.json`);
    }
  }
  return out;
}

function taskMd(t) {
  const list = (xs) => xs.map((x) => `- [ ] ${x}`).join('\n');
  return `# ${t.id} — ${t.title}

| Campo | Valor |
|---|---|
| task_id | ${t.id} |
| phase_id | ${t.phase} |
| priority | ${t.priority} |
| risk | ${t.risk} |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | ${t.dependencies.join(', ') || 'nenhuma'} |
| related_reqs | ${t.reqs.join(', ')} |
| review_policy | revisão humana antes do merge |

**Escopo:** ${t.scope}

## Critérios de aceite
${list(t.acceptance)}

## Testes
${list(t.tests)}

## Regras de handoff
Estado vivo em \`STATUS.json\` desta pasta e em \`.ases/STATUS.md\`. Não marcar COMPLETED sem evidência.
`;
}

function phaseMd(phase, tasks) {
  return `# ${phase.id} — ${phase.title}

Status: ver \`STATUS.json\` e \`.ases/STATUS.md\`
Requisitos: ${[...new Set(tasks.flatMap((t) => t.reqs))].join(', ')}
Entrada: repositório sem modificações destrutivas; fontes com SHA-256 conferido
Tarefas: ${tasks.map((t) => t.id).join(', ')}
Dependências (DAG): ${tasks.map((t) => `${t.id} ← ${t.dependencies.join('+') || '∅'}`).join('; ')}
Riscos: dependências npm de terceiros; matriz Windows/Linux não executável neste host (NOT_RUN)
Gate: ${phase.gate ?? 'definir ao iniciar a fase'}
Evidência: \`.ases/evidence/\`
Aprovador: humano responsável
`;
}

function cmdInit(root, planFile) {
  const s = store(root);
  const plan = JSON.parse(readFileSync(planFile, 'utf8'));
  const created = [];
  const put = (rel, content) => s.writeIfAbsent(rel, content) && created.push(rel);

  if (!existsSync(s.abs('MANIFEST.json'))) {
    const sources = plan.sources.map((rel) => {
      const file = path.join(root, rel);
      if (!existsSync(file)) throw new Error(`source not found: ${rel}`);
      return { path: rel, sha256: sha256(readFileSync(file)) };
    });
    const manifest = {
      schemaVersion: 1, projectId: `prj_${randomBytes(6).toString('hex')}`, name: plan.project.name,
      createdAt: new Date().toISOString(), versions: { projectSchema: 1, dbSchema: 0 }, sources,
    };
    put('MANIFEST.json', s.json(manifest));
    s.appendEvent('ProjectInitialized', { payload: { name: plan.project.name, sources: sources.length } });
  }

  put('VERSION', '1\n');
  put('CONFIG.json', s.json({
    schemaVersion: 1,
    project: { name: plan.project.name, locale: 'pt-BR' },
    scheduler: { mode: 'manual', maxParallelTasks: 1, maxAttempts: 3, taskTimeoutMinutes: 60 },
    security: { defaultPolicy: 'deny-unclassified', requireApprovalFor: ['package-install', 'network-external', 'git-push', 'publish', 'destructive'], storeRawPrompts: false, allowOutsideRepo: false },
    usage: { displayUnknownAs: 'N/D', apiBudgetEnabled: false },
    extensions: { autoInstall: false, autoUpdate: false },
    branding: { theme: 'teal', logo: 'auto' },
  }));
  put('PROJECT.md', `# ${plan.project.brand}

**Objetivo:** runtime local CLI/TUI (\`ases\` + \`ases-tar\`) para engenharia de software orientada a agentes — ver \`ASES_CLI_MD_MESTRE.md\`.

| Item | Estado |
|---|---|
| Escopo CLI/TUI macOS/Windows/Linux, sem web | CONFIRMED |
| Dois bins no mesmo pacote npm | CONFIRMED |
| Marca Eureka42 (⌘, 4 temas, NO_COLOR/ASCII) | CONFIRMED |
| npm workspaces em vez de pnpm | CONFIRMED (22/11/2026, ver docs/ADRs/ADR-0001.md) |
| Driver SQLite | PENDING (ADR-0002, PHASE-02) |
| Licença | PENDING (bloqueia publicação) |

**Fontes normativas** (hashes em \`MANIFEST.json\`): ASES-300 (REQ-001..300, normativa); ASES-500 consolidado (**para validação, não homologado**); requisitos do produto \`AER-REQ-001..250\` em \`docs/REQUISITOS_AER.csv\`.
`);
  put('MASTER-PLAN.md', `# Plano mestre AER\n\nFases do MD mestre §16. Apenas fases iniciadas têm pasta em \`phases/\`.\n\n| Fase | Título |\n|---|---|\n${plan.phases.map((p) => `| ${p.id} | ${p.title} |`).join('\n')}\n`);
  put('REQUIREMENTS.md', '# Requisitos\n\n- Gerais: `REQ-001..REQ-300` em `fontes/ASES-300_DOCUMENTACAO_INTEGRAL.md` (Cap. 24), não renumerar.\n- Produto: `AER-REQ-001..250` em `docs/REQUISITOS_AER.csv` (estado inicial PROPOSED).\n- Vínculos requisito → fase → tarefa → teste/evidência: `TRACEABILITY.csv` (gerado).\n');
  put('NEXT-STEPS.md', '# Próximos passos\n\n(editar ao fim de cada sessão)\n');
  put('HANDOFF.md', `# Handoff AER\n\n${AUTO_BEGIN}\n${AUTO_END}\n\n## Notas da sessão\n\n(editar ao fim de cada sessão)\n`);
  for (const dir of ['decisions', 'agents', 'extensions', 'checkpoints', 'evidence', 'reports', 'handoffs']) put(`${dir}/.gitkeep`, '');

  for (const phase of plan.phases) {
    const tasks = plan.tasks.filter((t) => t.phase === phase.id);
    if (!tasks.length) continue;
    const base = `phases/${phase.id}`;
    if (put(`${base}/STATUS.json`, s.json({ schemaVersion: 1, phaseId: phase.id, title: phase.title, state: 'PLANNED', evidence: [], notes: [] }))) {
      s.appendEvent('PhaseCreated', { phaseId: phase.id, payload: { title: phase.title } });
    }
    put(`${base}/PHASE.md`, phaseMd(phase, tasks));
    put(`${base}/PLAN.json`, s.json({ schemaVersion: 1, phaseId: phase.id, tasks: tasks.map(({ id, dependencies }) => ({ id, dependencies })) }));
    for (const t of tasks) {
      put(`${base}/${t.id}/TASK.md`, taskMd(t));
      const status = { schemaVersion: 1, taskId: t.id, phaseId: t.phase, title: t.title, state: 'PLANNED', reqs: t.reqs, tests: t.tests, evidence: [], notes: [] };
      if (put(`${base}/${t.id}/STATUS.json`, s.json(status))) s.appendEvent('TaskCreated', { phaseId: t.phase, taskId: t.id, payload: { title: t.title, reqs: t.reqs } });
    }
  }
  cmdRefresh(root);
  return created;
}

function cmdSet(root, id, state, { note, evidence }) {
  const s = store(root);
  const isPhase = /^PHASE-\d{2,}$/.test(id);
  const isTask = /^TAR-\d{4,}$/.test(id);
  if (!isPhase && !isTask) throw new UsageError(`invalid id: ${id}`);
  if (!(isPhase ? PHASE_STATES : TASK_STATES).includes(state)) throw new UsageError(`invalid state for ${id}: ${state}`);
  const rel = isPhase ? `phases/${id}/STATUS.json` : taskStatusFiles(s).find((f) => f.includes(`/${id}/`));
  if (!rel || !existsSync(s.abs(rel))) throw new UsageError(`unknown ${id}`);

  for (const ev of evidence) {
    if (path.isAbsolute(ev) || ev.split(/[\\/]/).includes('..')) throw new UsageError(`evidence must be a relative path inside the project: ${ev}`);
    if (!existsSync(path.join(root, ev))) throw new UsageError(`evidence not found: ${ev}`);
  }
  const status = s.readJson(rel);
  const allEvidence = [...new Set([...status.evidence, ...evidence])];
  // DoD mínimo (§5.6): nada vira COMPLETED sem ao menos uma evidência existente.
  if (state === 'COMPLETED' && allEvidence.length === 0) throw new UsageError(`${id} cannot be COMPLETED without --evidence`);

  const from = status.state;
  const now = new Date().toISOString();
  const next = { ...status, state, evidence: allEvidence, notes: note ? [...status.notes, { at: now, text: note }] : status.notes };
  s.writeAtomic(rel, s.json(next));
  s.appendEvent(isPhase ? 'PhaseUpdated' : 'TaskUpdated', {
    phaseId: status.phaseId, taskId: isTask ? id : null, payload: { from, to: state, evidence, note: note ?? null },
  });
  cmdRefresh(root);
}

function gitInfo(root) {
  const git = (...args) => {
    try {
      return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  };
  return { branch: git('symbolic-ref', '--short', 'HEAD') ?? 'desconhecido', head: git('rev-parse', '--short', 'HEAD') ?? 'sem commits' };
}

function cmdRefresh(root) {
  const s = store(root);
  const tasks = taskStatusFiles(s).map((f) => s.readJson(f));
  const phases = existsSync(s.abs('phases')) ? readdirSync(s.abs('phases')).sort().map((p) => s.readJson(`phases/${p}/STATUS.json`)) : [];
  const last = s.history().at(-1);
  const cell = (xs) => xs.join('<br>') || '—';

  s.writeAtomic('STATUS.md', `# STATUS AER

Último evento: seq ${last?.seq ?? '—'} (${last?.eventType ?? '—'}, ${last?.occurredAt ?? '—'})

## Fases
| Fase | Título | Estado | Evidência |
|---|---|---|---|
${phases.map((p) => `| ${p.phaseId} | ${p.title} | ${p.state} | ${cell(p.evidence)} |`).join('\n')}

## Tarefas
| Tarefa | Fase | Título | Estado | Evidência |
|---|---|---|---|---|
${tasks.map((t) => `| ${t.taskId} | ${t.phaseId} | ${t.title} | ${t.state} | ${cell(t.evidence)} |`).join('\n')}

Estados sem evidência listada não foram verificados. NOT_RUN ≠ PASS.
`);

  const csvCell = (v) => `"${String(v).replaceAll('"', '""')}"`;
  const rows = tasks.flatMap((t) => t.reqs.map((r) => [r, t.phaseId, t.taskId, t.tests.join(' | '), t.evidence.join(' | '), t.state].map(csvCell).join(',')));
  s.writeAtomic('TRACEABILITY.csv', `req_id,phase_id,task_id,tests,evidence,state\n${rows.join('\n')}\n`);

  if (existsSync(s.abs('HANDOFF.md'))) {
    const g = gitInfo(root);
    const active = tasks.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.state));
    const auto = `${AUTO_BEGIN}
- Último evento válido: seq ${last?.seq ?? '—'} em ${last?.occurredAt ?? '—'}
- Git: branch \`${g.branch}\`, HEAD \`${g.head}\`
- Concluídas: ${tasks.filter((t) => t.state === 'COMPLETED').map((t) => t.taskId).join(', ') || 'nenhuma'}
- Abertas: ${active.map((t) => `${t.taskId} (${t.state})`).join(', ') || 'nenhuma'}
- Comando para retomar: \`node scripts/ases-dev.mjs refresh\` e ler \`.ases/NEXT-STEPS.md\` (o \`ases resume\` ainda não existe)
${AUTO_END}`;
    const text = readFileSync(s.abs('HANDOFF.md'), 'utf8');
    const start = text.indexOf(AUTO_BEGIN);
    const end = text.indexOf(AUTO_END);
    if (start !== -1 && end > start) s.writeAtomic('HANDOFF.md', text.slice(0, start) + auto + text.slice(end + AUTO_END.length));
  }
}

function cmdVerify(root) {
  const events = store(root).history();
  const problems = [];
  const ids = new Set();
  events.forEach((e, i) => {
    if (e.seq !== i + 1) problems.push(`line ${i + 1}: expected seq ${i + 1}, got ${e.seq}`);
    if (ids.has(e.eventId)) problems.push(`line ${i + 1}: duplicate eventId ${e.eventId}`);
    ids.add(e.eventId);
    if (sha256(canonical(e.payload)) !== e.payloadSha256) problems.push(`line ${i + 1}: payloadSha256 mismatch (seq ${e.seq})`);
  });
  return { events: events.length, problems };
}

function main(argv) {
  const opts = parseArgs(argv);
  const [cmd, id, state] = opts.positional;
  if (cmd === 'init') {
    const created = cmdInit(opts.root, opts.plan);
    console.log(created.length ? `created ${created.length} file(s):\n  ${created.join('\n  ')}` : 'nothing to create (.ases/ already initialized)');
  } else if (cmd === 'set') {
    if (!id || !state) throw new UsageError('usage: set <ID> <STATE> [--note txt] [--evidence path]');
    cmdSet(opts.root, id, state, opts);
    console.log(`${id} -> ${state}`);
  } else if (cmd === 'refresh') {
    cmdRefresh(opts.root);
    console.log('refreshed STATUS.md, TRACEABILITY.csv, HANDOFF.md');
  } else if (cmd === 'verify') {
    const r = cmdVerify(opts.root);
    for (const p of r.problems) console.error(p);
    console.log(`history: ${r.events} event(s), ${r.problems.length} problem(s)`);
    if (r.problems.length) process.exitCode = 1;
  } else {
    throw new UsageError('usage: ases-dev.mjs <init|set|refresh|verify> [--root dir]');
  }
}

try {
  main(process.argv.slice(2));
} catch (err) {
  console.error(`ases-dev: ${err.message}`);
  process.exitCode = err instanceof UsageError ? 2 : 1;
}
