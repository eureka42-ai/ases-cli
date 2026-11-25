import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  ASES500_VALIDATION_SEAL, KNOWN_SOURCES, MethodologyError, bundledSourcesDir, currentDecisions, gateG0, gateG1, nextRound,
  parseDiscoveryTracks, parseGeneralRequirements, sha256, type DiscoveryQuestion, type GateResult, type SourceKey,
} from '@aer/ases-methodology';
import type { Engine } from './engine.ts';

export const METHODOLOGY_HELP = `Metodologia ASES-300/500 (PHASE-09):
  /ases import [pasta]            copia as 3 fontes ASES para .ases/sources (SHA-256 conferido) e importa REQ-001..300 literais
  /spec                           próxima rodada da entrevista ASES-500 (só lacunas, até 6 perguntas)
  /spec answer|propose|validate|open <A.1> <texto>    registra decisão CONFIRMED | PROPOSED | VALIDATION_REQUIRED | OPEN
  /spec na <A.1|B> <justificativa>                    pergunta ou trilha inteira não aplicável
  /spec change CHANGE-XXXX <A.1> <texto>              substitui decisão CONFIRMED (exige CHANGE que cite a pergunta)
  /spec decisions                 decisões vigentes
  /reqs [GENERAL|DOMAIN] [ESTADO] matriz de requisitos (resumo + itens filtrados)
  /req REQ-XXX                    detalhe (texto literal da fonte para os gerais)
  /req add <PRIORIDADE> <origem> <título> :: <critério de aceite>   requisito do projeto (REQ-301+)
  /req approve REQ-3XX <responsável>
  /req set REQ-XXX <PENDING|IN_PROGRESS|PASS|FAIL|BLOCKED|N/A> [--evidence arquivo] [--approved-by nome] [justificativa]
  /req edit REQ-3XX [--change CHANGE-XXXX] [título] :: [critério]
  /change new --approved-by <nome> --targets REQ-301,A.1 <motivo>
  /gate G0|G1                     verifica o gate metodológico (§13.4)`;

export const METHODOLOGY_COMMANDS = new Set(['/ases', '/spec', '/reqs', '/req', '/change', '/gate']);

const SOURCES_DIR = path.join('.ases', 'sources');

function take(words: string[], flag: string): string | undefined {
  const i = words.indexOf(flag);
  return i < 0 ? undefined : words.splice(i, 2)[1];
}

/** Arquivo de evidência dentro do projeto, com SHA-256 (mesma regra do /evidence). */
function evidenceFile(root: string, file: string): { path: string; sha256: string } {
  const real = realpathSync.native(root);
  const abs = path.resolve(real, file);
  if (!existsSync(abs) || !statSync(abs).isFile()) throw Object.assign(new Error(`arquivo não encontrado: ${file}`), { code: 'INVALID_INPUT' });
  const resolved = realpathSync.native(abs);
  if (!resolved.startsWith(real + path.sep)) throw Object.assign(new Error(`evidência precisa estar dentro do projeto: ${file}`), { code: 'INVALID_INPUT' });
  return { path: path.relative(real, resolved).split(path.sep).join('/'), sha256: sha256(readFileSync(resolved)) };
}

export function discoveryQuestions(engine: Engine): DiscoveryQuestion[] {
  const f = path.join(engine.projectRoot, SOURCES_DIR, KNOWN_SOURCES.ASES500_SPECIFIER.file);
  if (!existsSync(f)) throw Object.assign(new Error('fontes ASES não importadas: rode /ases import'), { code: 'NOT_FOUND' });
  return parseDiscoveryTracks(readFileSync(f, 'utf8'));
}

const showGate = (g: GateResult) => [`${g.gate}: ${g.pass ? 'PASS' : 'FAIL'}`, ...g.checks.map((c) => `  ${c.ok ? 'ok ' : 'NÃO'} ${c.id}: ${c.detail}`)].join('\n');

export function handleMethodology(engine: Engine, cmd: string, sub: string | undefined, rest: string[]): string {
  const s = engine.store;
  switch (cmd) {
    case '/ases': {
      if (sub !== 'import') return 'uso: /ases import [pasta com as fontes ASES]';
      const from = rest[0] ? path.resolve(engine.projectRoot, rest[0]) : [path.join(engine.projectRoot, 'fontes'), bundledSourcesDir()].find((d) => existsSync(path.join(d, KNOWN_SOURCES.ASES300.file)));
      if (!from) return 'fontes ASES não encontradas (nem ./fontes nem as distribuídas com o AER); informe a pasta: /ases import <pasta>';
      const dest = path.join(engine.projectRoot, SOURCES_DIR);
      mkdirSync(dest, { recursive: true });
      const out: string[] = [];
      for (const key of Object.keys(KNOWN_SOURCES) as SourceKey[]) {
        const k = KNOWN_SOURCES[key];
        const src = path.join(from, k.file);
        if (!existsSync(src)) return `fonte ausente: ${src}`;
        const got = sha256(readFileSync(src));
        // AER-REQ-151: só a fonte conhecida, byte a byte; texto alterado não é tratado como normativo
        if (got !== k.sha256) return `${k.file}: SHA-256 ${got.slice(0, 12)}… difere do conhecido ${k.sha256.slice(0, 12)}…; importação recusada`;
        const target = path.join(dest, k.file);
        if (!existsSync(target) || sha256(readFileSync(target)) !== got) copyFileSync(src, target);
        const rel = path.join(SOURCES_DIR, k.file).split(path.sep).join('/');
        const general = key === 'ASES300' ? parseGeneralRequirements(readFileSync(target, 'utf8')) : [];
        const r = engine.mutate((st) => st.importMethodologySource(key, rel, got, general));
        out.push(`${key}: ${rel} (sha256 ${got.slice(0, 12)}…)${key === 'ASES300' ? ` · ${r.inserted} REQ gerais novos (${s.listRequirements('GENERAL').length}/300 na matriz)` : ''}`);
      }
      out.push(`Aviso: ${ASES500_VALIDATION_SEAL}.`);
      return out.join('\n');
    }
    case '/spec': {
      const qs = discoveryQuestions(engine);
      const decisions = s.listDecisions();
      if (!sub) {
        const cur = [...currentDecisions(decisions).values()];
        const by = cur.reduce<Record<string, number>>((a, d) => ({ ...a, [d.state]: (a[d.state] ?? 0) + 1 }), {});
        const round = nextRound(qs, decisions);
        return [
          `Entrevista ASES-500 (${ASES500_VALIDATION_SEAL})`,
          `Decisões vigentes: ${cur.length ? Object.entries(by).map(([k, v]) => `${k} ${v}`).join(' · ') : 'nenhuma'}`,
          round.length ? 'Perguntas desta rodada (responda com /spec answer|propose|na <id> <texto>):' : 'Nenhuma lacuna aberta nas trilhas A–J. Verifique com /gate G1.',
          ...round.map((q) => `  ${q.id} [${q.track}. ${q.trackTitle}] ${q.text}`),
        ].join('\n');
      }
      if (sub === 'decisions') {
        const cur = [...currentDecisions(decisions).values()];
        return cur.map((d) => `${d.id} ${d.questionId.padEnd(5)} ${d.state.padEnd(19)} ${d.question}: ${d.answer}`).join('\n') || '(nenhuma decisão)';
      }
      const STATE: Record<string, string> = { answer: 'CONFIRMED', propose: 'PROPOSED', validate: 'VALIDATION_REQUIRED', open: 'OPEN', na: 'N/A', change: 'CONFIRMED' };
      const state = STATE[sub];
      if (!state) return 'uso: /spec | /spec answer|propose|validate|open|na <id> <texto> | /spec change CHANGE-XXXX <id> <texto> | /spec decisions';
      const words = [...rest];
      const changeId = sub === 'change' ? words.shift() : undefined;
      const qid = words.shift() ?? '';
      const q = qs.find((x) => x.id === qid);
      const trackOnly = /^[A-Z]$/.test(qid) ? qs.find((x) => x.track === qid) : undefined;
      if (!q && !trackOnly) return `pergunta desconhecida: ${qid || '(vazia)'} (veja /spec)`;
      if (trackOnly && state !== 'N/A') return 'uma trilha inteira só pode ser marcada N/A (/spec na <letra> <justificativa>)';
      const id = engine.mutate((st) => st.recordDecision({
        questionId: qid, question: q ? `${q.trackTitle}: ${q.text}` : trackOnly!.trackTitle, answer: words.join(' '), state, ...(changeId ? { changeId } : {}),
      }));
      return `${id} ${qid} ${state}`;
    }
    case '/reqs': {
      const series = sub === 'GENERAL' || sub === 'DOMAIN' ? sub : undefined;
      const status = series ? rest[0] : sub;
      const all = s.listRequirements(series);
      if (!all.length) return 'matriz vazia: rode /ases import';
      const by = all.reduce<Record<string, number>>((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});
      const head = `${all.length} requisito(s)${series ? ` ${series}` : ''}: ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(' · ')}`;
      const list = status ? all.filter((r) => r.status === status) : series === 'DOMAIN' ? all : [];
      return [head, ...list.map((r) => `${r.id} ${r.status.padEnd(11)} ${r.priority.padEnd(8)} ${r.classification.padEnd(18)} ${r.title}${r.approvedBy ? ` [aprovado: ${r.approvedBy}]` : ''}`),
        ...(!status && series !== 'DOMAIN' ? ['(filtre por estado: /reqs GENERAL PENDING, /reqs DOMAIN, /reqs N/A)'] : [])].join('\n');
    }
    case '/req': {
      if (sub && /^REQ-\d{3,}$/.test(sub)) {
        const r = s.getRequirement(sub);
        if (!r) return `${sub} não está na matriz`;
        return [`${r.id} · ${r.series} · ${r.classification} · ${r.priority} · ${r.status}${r.approvedBy ? ` · aprovado por ${r.approvedBy}` : ''}`,
          `origem ${r.origin} · texto sha256 ${r.textSha256.slice(0, 12)}…${r.dependencies.length ? ` · depende de ${r.dependencies.join(', ')}` : ''}`,
          ...(r.note ? [`nota: ${r.note}`] : []), ...(r.evidencePath ? [`evidência: ${r.evidencePath} (sha256 ${r.evidenceSha256!.slice(0, 12)}…)`] : []),
          '', r.text].join('\n');
      }
      const words = [...rest];
      if (sub === 'add') {
        const [priority = '', origin = '', ...t] = words;
        const [title = '', acceptance = ''] = t.join(' ').split('::').map((x) => x.trim());
        const deps = take(t, '--deps');
        return `criado ${engine.mutate((st) => st.createDomainRequirement({ title, acceptance, priority, origin, ...(deps ? { dependencies: deps.split(',') } : {}) }))}`;
      }
      if (sub === 'approve') {
        const [id = '', ...who] = words;
        engine.mutate((st) => st.approveRequirement(id, who.join(' ')));
        return `${id} aprovado por ${who.join(' ')}`;
      }
      if (sub === 'set') {
        const [id = '', status = '', ...t] = words;
        const ev = take(t, '--evidence');
        const by = take(t, '--approved-by');
        const evidence = ev ? evidenceFile(engine.projectRoot, ev) : undefined;
        engine.mutate((st) => st.setRequirementStatus(id, status, { note: t.join(' '), ...(evidence ? { evidence } : {}), ...(by ? { approvedBy: by } : {}) }));
        return `${id} → ${status}${evidence ? ` (evidência ${evidence.path})` : ''}`;
      }
      if (sub === 'edit') {
        const [id = '', ...t] = words;
        const change = take(t, '--change');
        const [title = '', acceptance = ''] = t.join(' ').split('::').map((x) => x.trim());
        engine.mutate((st) => st.editDomainRequirement(id, { ...(title ? { title } : {}), ...(acceptance ? { acceptance } : {}) }, change));
        return `${id} atualizado${change ? ` (${change})` : ''}`;
      }
      return 'uso: /req REQ-XXX | /req add|approve|set|edit … (veja /help)';
    }
    case '/change': {
      if (sub !== 'new') return 'uso: /change new --approved-by <nome> --targets REQ-301,A.1 <motivo>';
      const words = [...rest];
      const by = take(words, '--approved-by') ?? '';
      const targets = (take(words, '--targets') ?? '').split(',');
      return `criada ${engine.mutate((st) => st.createChange({ reason: words.join(' '), targets, approvedBy: by }))}`;
    }
    case '/gate': {
      if (sub === 'G0') {
        const srcs = s.listMethodologySources().map((x) => ({ key: x.key as SourceKey, sha256: x.sha256 }));
        return showGate(gateG0({ sources: srcs, generalCount: s.listRequirements('GENERAL').length }));
      }
      if (sub === 'G1') {
        const domain = s.listRequirements('DOMAIN').map((r) => ({ id: r.id, approved: !!r.approvedBy, acceptance: r.acceptance }));
        return showGate(gateG1({ decisions: s.listDecisions(), domain }));
      }
      return 'uso: /gate G0|G1 (G2..G5: planejados para as fases seguintes)';
    }
    default:
      throw new MethodologyError('UNKNOWN_COMMAND', cmd);
  }
}
