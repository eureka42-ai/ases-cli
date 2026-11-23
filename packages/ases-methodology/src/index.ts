import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Metodologia ASES-300/500 executável (§13, PHASE-09). Lê as fontes byte a byte, sem editar nem parafrasear:
 * os REQ-001..300 entram literalmente (AER-REQ-152) e as perguntas da entrevista são os itens das trilhas A–J
 * do especificador ASES-500 (seção 3 da fonte), não perguntas inventadas.
 */
export const KNOWN_SOURCES = {
  ASES300: { file: 'ASES-300_DOCUMENTACAO_INTEGRAL.md', sha256: '22e439ea514e1f365d3611a8644aac861f8c739054f8c35084a0e94e30302314' },
  ASES500_SPECIFIER: { file: 'ASES-500_GPT_ESPECIFICADOR_INTERATIVO_TRABALHO.md', sha256: 'd3ba609a5aeef064256f6e232d07347009d583d95d71f3c6520d4eed81b4df72' },
  ASES500_METHOD: { file: 'ASES-500_METODOLOGIA_CONSOLIDADA_PARA_VALIDACAO.md', sha256: '1a2b4619825233f6107e74d05d7171454c16d5841b476e4086e3d9287c7aa78c' },
} as const;
export type SourceKey = keyof typeof KNOWN_SOURCES;

/** Selo obrigatório da fonte consolidada (AER-REQ-153): o AER nunca a apresenta como homologada. */
export const ASES500_VALIDATION_SEAL = 'ASES-500 consolidada PARA VALIDAÇÃO (reconstrução; não é original homologado)';

/**
 * Pasta `fontes/` distribuída com o AER: sobe a partir deste módulo até achar `fontes/` com o ASES-300. Vale no repositório
 * (packages/ases-methodology/{src,dist}) e no pacote npm instalado (node_modules/@aer/ases-methodology/dist → raiz do pacote).
 */
export function bundledSourcesDir(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'fontes');
    if (existsSync(path.join(candidate, KNOWN_SOURCES.ASES300.file))) return candidate;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../fontes');
}

export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

export const CLASSIFICATIONS = ['CORE', 'CONDITIONAL', 'DOMAIN'] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];
export const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type Priority = (typeof PRIORITIES)[number];
/** Estados oficiais da fonte ASES-300 (cap. 24.2). */
export const REQUIREMENT_STATES = ['PENDING', 'IN_PROGRESS', 'PASS', 'FAIL', 'BLOCKED', 'N/A'] as const;
export type RequirementState = (typeof REQUIREMENT_STATES)[number];
/**
 * Estados de decisão: CONFIRMED/PROPOSED/OPEN/VALIDATION_REQUIRED/SUPERSEDED (ASES-500 §4.2) + N/A (especificador §2.5).
 * Não se mistura com o estado de implementação do requisito.
 */
export const DECISION_STATES = ['CONFIRMED', 'PROPOSED', 'OPEN', 'VALIDATION_REQUIRED', 'SUPERSEDED', 'N/A'] as const;
export type DecisionState = (typeof DECISION_STATES)[number];

export type GeneralClassification = 'CORE' | 'CONDITIONAL' | 'DOMAIN/CONDITIONAL';

export interface GeneralRequirement {
  id: string;
  title: string;
  /** literal da fonte: CORE, CONDITIONAL ou DOMAIN/CONDITIONAL (10 itens, p.ex. REQ-116) */
  classification: GeneralClassification;
  priority: Priority;
  /** seção 24.x da fonte (grupo) */
  group: string;
  /** bloco literal da fonte, do título até a linha "Critério de aceite mínimo" */
  text: string;
  textSha256: string;
  acceptance: string;
}

export class MethodologyError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'MethodologyError';
  }
}

/** Extrai os 300 requisitos gerais exatamente como estão na fonte; qualquer desvio de formato é erro (nada é inferido). */
export function parseGeneralRequirements(src: string): GeneralRequirement[] {
  const lines = src.split('\n');
  const out: GeneralRequirement[] = [];
  let group = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const g = /^## (24\.\d+ .+)$/.exec(line);
    if (g) group = g[1]!.trim();
    const h = /^### (REQ-(\d{3})) — (.+)$/.exec(line);
    if (!h) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j]!.startsWith('Critério de aceite mínimo:') && !/^#{1,3} /.test(lines[j]!)) j++;
    if (j >= lines.length || !lines[j]!.startsWith('Critério de aceite mínimo:')) throw new MethodologyError('SOURCE_FORMAT', `${h[1]}: no "Critério de aceite mínimo" line`);
    const text = lines.slice(i, j + 1).join('\n');
    const cls = /^Classificação sugerida: (CORE|CONDITIONAL|DOMAIN\/CONDITIONAL)\. Prioridade sugerida: (CRITICAL|HIGH|MEDIUM|LOW)\.$/m.exec(text);
    if (!cls) throw new MethodologyError('SOURCE_FORMAT', `${h[1]}: classification/priority line not found`);
    out.push({
      id: h[1]!, title: h[3]!.trim(), classification: cls[1] as GeneralClassification, priority: cls[2] as Priority, group,
      text, textSha256: sha256(text), acceptance: lines[j]!.slice('Critério de aceite mínimo:'.length).trim(),
    });
    i = j;
  }
  if (out.length !== 300) throw new MethodologyError('SOURCE_FORMAT', `expected 300 general requirements, found ${out.length}`);
  out.forEach((r, k) => {
    const want = `REQ-${String(k + 1).padStart(3, '0')}`;
    if (r.id !== want) throw new MethodologyError('SOURCE_FORMAT', `requirement ${k + 1} is ${r.id}, expected ${want} (no renumbering)`);
  });
  return out;
}

export interface DiscoveryQuestion {
  /** p.ex. "A.3" */
  id: string;
  track: string;
  trackTitle: string;
  /** item literal da trilha na fonte */
  text: string;
}

/** Trilhas A–J da seção 3 do especificador ASES-500; cada item separado por "; " vira uma pergunta. */
export function parseDiscoveryTracks(src: string): DiscoveryQuestion[] {
  const start = src.indexOf('\n## 3.');
  const end = src.indexOf('\n## 4.', start + 1);
  if (start < 0 || end < 0) throw new MethodologyError('SOURCE_FORMAT', 'ASES-500 specifier: section 3 (trilhas) not found');
  const out: DiscoveryQuestion[] = [];
  let track = '';
  let trackTitle = '';
  for (const line of src.slice(start, end).split('\n')) {
    const t = /^### ([A-Z])\. (.+)$/.exec(line);
    if (t) {
      track = t[1]!;
      trackTitle = t[2]!.trim();
      continue;
    }
    if (track && line.startsWith('- ')) {
      const items = line.slice(2).replace(/\.\s*$/, '').split(/;\s+/).map((x) => x.trim()).filter(Boolean);
      for (const text of items) out.push({ id: `${track}.${out.filter((q) => q.track === track).length + 1}`, track, trackTitle, text });
    }
  }
  if (!out.length) throw new MethodologyError('SOURCE_FORMAT', 'ASES-500 specifier: no discovery items found');
  return out;
}

export interface DecisionLike {
  id: string;
  /** "A.3" para uma pergunta, ou só a letra da trilha ("G") para uma trilha inteira */
  questionId: string;
  state: DecisionState;
}

/** Última decisão vigente por pergunta (SUPERSEDED nunca é a vigente). */
export function currentDecisions<T extends DecisionLike>(decisions: readonly T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const d of decisions) if (d.state !== 'SUPERSEDED') m.set(d.questionId, d);
  return m;
}

/**
 * Próxima rodada da entrevista (§13.1, AER-REQ-154): só lacunas reais, 3–6 perguntas, na ordem das trilhas.
 * Pergunta com decisão CONFIRMED/PROPOSED/VALIDATION_REQUIRED/N/A, ou de trilha marcada N/A, não é repetida.
 */
export function nextRound(questions: readonly DiscoveryQuestion[], decisions: readonly DecisionLike[], max = 6): DiscoveryQuestion[] {
  const cur = currentDecisions(decisions);
  const answered = (id: string) => {
    const d = cur.get(id);
    return d !== undefined && d.state !== 'OPEN';
  };
  return questions.filter((q) => !answered(q.id) && !answered(q.track)).slice(0, Math.min(Math.max(max, 1), 6));
}

export interface GateCheck {
  id: string;
  ok: boolean;
  detail: string;
}
export interface GateResult {
  gate: string;
  pass: boolean;
  checks: GateCheck[];
}
const gate = (name: string, checks: GateCheck[]): GateResult => ({ gate: name, pass: checks.every((c) => c.ok), checks });

/** G0 — contexto conhecido e fontes validadas (§13.4). */
export function gateG0(i: { sources: { key: SourceKey; sha256: string | null }[]; generalCount: number }): GateResult {
  const checks: GateCheck[] = (Object.keys(KNOWN_SOURCES) as SourceKey[]).map((key) => {
    const got = i.sources.find((s) => s.key === key)?.sha256 ?? null;
    const want = KNOWN_SOURCES[key].sha256;
    return { id: `source:${key}`, ok: got === want, detail: got === null ? 'não importada' : got === want ? 'SHA-256 confere' : `SHA-256 diferente (${got.slice(0, 12)}…)` };
  });
  checks.push({ id: 'general-requirements', ok: i.generalCount === 300, detail: `${i.generalCount}/300 REQ gerais na matriz` });
  return gate('G0', checks);
}

/** G1 — escopo, riscos e requisitos aprovados (§13.4): nada OPEN/PROPOSED/VALIDATION_REQUIRED; requisitos de domínio aprovados e com aceite. */
export function gateG1(i: { decisions: readonly DecisionLike[]; domain: readonly { id: string; approved: boolean; acceptance: string }[] }): GateResult {
  const cur = [...currentDecisions(i.decisions).values()];
  const pending = (s: DecisionState) => cur.filter((d) => d.state === s).map((d) => d.questionId);
  const checks: GateCheck[] = [
    { id: 'scope-confirmed', ok: cur.some((d) => d.questionId.startsWith('A') && d.state === 'CONFIRMED'), detail: 'trilha A (ideia e resultado) com ao menos uma decisão CONFIRMED' },
    ...(['OPEN', 'PROPOSED', 'VALIDATION_REQUIRED'] as const).map((s) => {
      const xs = pending(s);
      return { id: `no-${s.toLowerCase()}`, ok: xs.length === 0, detail: xs.length ? `${s}: ${xs.join(', ')}` : `nenhuma decisão ${s}` };
    }),
    { id: 'domain-requirements', ok: i.domain.length > 0, detail: `${i.domain.length} requisito(s) de domínio (REQ-301+)` },
  ];
  const unapproved = i.domain.filter((r) => !r.approved).map((r) => r.id);
  const noAcceptance = i.domain.filter((r) => !r.acceptance.trim()).map((r) => r.id);
  checks.push({ id: 'domain-approved', ok: unapproved.length === 0, detail: unapproved.length ? `sem aprovação: ${unapproved.join(', ')}` : 'todos aprovados' });
  checks.push({ id: 'domain-acceptance', ok: noAcceptance.length === 0, detail: noAcceptance.length ? `sem critério de aceite: ${noAcceptance.join(', ')}` : 'todos com critério de aceite' });
  return gate('G1', checks);
}
