import { describeToolCall, type AgentStreamEvent } from '@aer/provider-sdk';

// PHASE-19: conversa no estilo do Claude Code, com a marca Eureka42. "> " cinza para você, "● " verde para a IA,
// "● " laranja para o que ela está fazendo e o que mudou (+ verde / − vermelho), listas/negrito/código formatados e
// quebra por palavra com recuo.

export type EntryKind = 'user' | 'main' | 'activity' | 'system' | 'error' | 'progress';
export interface Entry { kind: EntryKind; who?: string; text: string }
export type Color = 'gray' | 'green' | 'red' | 'orange';
export interface Segment { text: string; bold?: boolean; color?: Color }
export interface Line { segments: Segment[]; color?: Color; bold?: boolean; dim?: boolean }

const ACTIVITY = /^● (.*)$/;
const DIFF_LINE = /^ {4}[-+ …]/;

/** Separa a saída de um comando: `ia> …` é a resposta; `● …` é atividade (com o diff embaixo); `erro …`; progresso. */
export function parseOutput(text: string, providers: readonly string[]): Entry[] {
  const out: Entry[] = [];
  const names = new Set(providers.map((p) => p.split(':')[0]));
  let cur: Entry | undefined;
  const flush = () => {
    if (cur) out.push(cur);
    cur = undefined;
  };
  for (const raw of text.split('\n')) {
    const m = /^([a-z][a-z0-9-]*(?::[a-z0-9.-]+)?)> ?(.*)$/.exec(raw);
    const act = ACTIVITY.exec(raw);
    if (m && names.has(m[1]!.split(':')[0]!)) {
      flush();
      cur = { kind: 'main', who: m[1]!, text: m[2]! };
    } else if (act) {
      flush();
      cur = { kind: 'activity', text: act[1]! };
    } else if (cur?.kind === 'activity' && DIFF_LINE.test(raw)) {
      cur.text += `\n${raw}`;
    } else if (/^erro\b/.test(raw)) {
      flush();
      out.push({ kind: 'error', text: raw });
    } else if (/^\s+TAR-\d{4,}\s+\S+\s+[A-Z_]+/.test(raw) && cur?.kind !== 'system') {
      flush();
      out.push({ kind: 'progress', text: raw });
    } else if (cur?.kind === 'main' && !/^(Plano PLN-|Resultado de PLN-|plano recusado|executando|  \(editou)/.test(raw)) {
      cur.text += `\n${raw}`;
    } else if (cur?.kind === 'system') {
      cur.text += `\n${raw}`;
    } else {
      flush();
      cur = { kind: 'system', text: raw };
    }
  }
  flush();
  return out;
}

/** Quebra por palavra; palavras maiores que a largura são cortadas. */
function wrapWords(text: string, width: number): string[] {
  const w = Math.max(4, width);
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/(\s+)/)) {
    if (!word) continue;
    if ([...line].length + [...word].length <= w) {
      line += word;
      continue;
    }
    if (line.trim()) lines.push(line.trimEnd());
    let rest = word.trimStart();
    while ([...rest].length > w) {
      lines.push([...rest].slice(0, w).join(''));
      rest = [...rest].slice(w).join('');
    }
    line = rest;
  }
  if (line.trim() || !lines.length) lines.push(line.trimEnd());
  return lines;
}

/** Corpo de uma mensagem: recuo, listas com •, **negrito**, ``` código ``` esmaecido, quebra por palavra. */
function body(text: string, width: number, unicode: boolean, first: Segment, indent: string): Line[] {
  const out: Line[] = [];
  let code = false;
  let isFirst = true;
  const lead = (): Segment[] => {
    const s = isFirst ? first : { text: indent };
    isFirst = false;
    return [s];
  };
  for (const raw of text.split('\n')) {
    if (/^\s*```/.test(raw)) {
      code = !code;
      continue;
    }
    if (code) {
      for (const l of wrapWords(raw, width - indent.length - 2)) out.push({ segments: [...lead(), { text: `  ${l}` }], dim: true });
      continue;
    }
    const bullet = /^(\s*)[-*] (.*)$/.exec(raw);
    const extra = bullet ? `${bullet[1]}  ${unicode ? '•' : '*'} ` : '';
    const content = bullet ? bullet[2]! : raw;
    const visible = content.replace(/\*\*([^*]+)\*\*/g, '$1');
    const boldWords = [...content.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1]!);
    wrapWords(visible, width - indent.length - extra.length).forEach((l, i) => {
      const segs: Segment[] = [...lead(), ...(extra ? [{ text: i === 0 ? extra : ' '.repeat(extra.length) }] : [])];
      let rest = l;
      for (const bw of boldWords) {
        const at = rest.indexOf(bw);
        if (at < 0) continue;
        if (at) segs.push({ text: rest.slice(0, at) });
        segs.push({ text: bw, bold: true });
        rest = rest.slice(at + bw.length);
      }
      if (rest) segs.push({ text: rest });
      out.push({ segments: segs });
    });
  }
  return out;
}

/** Mensagens → linhas da TUI, com uma linha em branco antes de cada mensagem (sua ou da IA). */
export function renderEntries(entries: readonly Entry[], width: number, unicode: boolean): Line[] {
  const out: Line[] = [];
  const dot = unicode ? '● ' : '* ';
  entries.forEach((e, i) => {
    const prev = entries[i - 1];
    const spaced = e.kind === 'user' || e.kind === 'main' || (prev !== undefined && (prev.kind === 'user' || (e.kind !== 'activity' && prev.kind === 'activity')));
    if (i > 0 && spaced) out.push({ segments: [{ text: ' ' }] }); // ' ': o Ink some com linha vazia
    switch (e.kind) {
      case 'user':
        out.push(...body(e.text, width, unicode, { text: '> ' }, '  ').map((l) => ({ ...l, color: 'gray' as const })));
        break;
      case 'main':
        out.push(...body(e.text, width, unicode, { text: dot, color: 'green' }, '  '));
        break;
      case 'activity': {
        const [head = '', ...rest] = e.text.split('\n');
        out.push(...wrapWords(head, width - 2).map((t, k) => ({ segments: [k === 0 ? { text: dot, color: 'orange' as const } : { text: '  ' }, { text: t }] })));
        for (const l of rest) {
          const seg = { text: [...l].slice(0, width).join('') };
          out.push(/^ {4}\+/.test(l) ? { segments: [seg], color: 'green' } : /^ {4}-/.test(l) ? { segments: [seg], color: 'red' } : { segments: [seg], dim: true });
        }
        break;
      }
      case 'error':
        out.push(...wrapWords(e.text, width).map((t): Line => ({ segments: [{ text: t }], color: 'red' })));
        break;
      case 'progress':
        out.push(...wrapWords(e.text, width).map((t): Line => ({ segments: [{ text: t }], dim: true })));
        break;
      default:
        out.push(...e.text.split('\n').flatMap((t) => wrapWords(t, width)).map((t): Line => ({ segments: [{ text: t }] })));
    }
  });
  return out;
}

/** Evento da IA → linha de atividade ("Lendo src/app.ts"); mensagens não viram atividade. */
export function activityText(e: AgentStreamEvent): string | undefined {
  if (e.type === 'file_change') return `${e.kind === 'create' ? 'Criando' : e.kind === 'delete' ? 'Apagando' : 'Editando'} ${e.relativePath}`;
  if (e.type !== 'tool_call') return undefined;
  return describeToolCall(e.name, e.safeArguments);
}

/** O que a principal mudou: uma linha por arquivo com +/− e as linhas alteradas (no máximo 12 por arquivo). */
export function changesText(changes: readonly { file: string; added: number; removed: number; patch: string }[]): string {
  return changes.flatMap((c) => {
    const lines = c.patch.split('\n').filter((l) => /^[-+]/.test(l));
    return [`● Editou ${c.file} (+${c.added} −${c.removed})`, ...lines.slice(0, 12).map((l) => `    ${l}`), ...(lines.length > 12 ? [`    … mais ${lines.length - 12} linhas`] : [])];
  }).join('\n');
}

export const THINKING_WORDS = ['Matutando', 'Ruminando', 'Maquinando', 'Tramando', 'Lapidando', 'Garimpando', 'Costurando', 'Tecendo', 'Fermentando', 'Rabiscando', 'Destrinchando', 'Engenhando', 'Arquitetando', 'Burilando', 'Cozinhando'];

export interface Thinking { provider: string; since: number; recent: string[] }

/** "✻ Matutando… (claude · 18 s · Lendo X · Esc para interromper)"; a palavra muda a cada 4 s. */
export function thinkingParts(t: Thinking, now: number, unicode: boolean): { glyph: string; word: string; rest: string } {
  const s = Math.max(0, Math.floor((now - t.since) / 1000));
  const word = THINKING_WORDS[(Math.floor(s / 4) + Math.floor(t.since / 1000)) % THINKING_WORDS.length]!;
  const what = t.recent.at(-1);
  return { glyph: unicode ? '✻' : '*', word: `${word}${unicode ? '…' : '...'}`, rest: `(${[t.provider, `${s} s`, ...(what ? [what] : []), 'Esc para interromper'].join(' · ')})` };
}
