import { describe, expect, it } from 'vitest';
import { assignProviders, parseMainReply } from '../src/index.ts';

const block = (o: unknown) => `Vou dividir.\n\n\`\`\`aer-plan\n${JSON.stringify(o)}\n\`\`\`\n`;
const t = (title: string, extra: Record<string, unknown> = {}) => ({ title, instructions: `faça ${title}`, ...extra });
const base = { busy: {}, limits: {}, consented: new Set<string>() };

describe('aer-plan parser (PHASE-18, TAR-0082)', () => {
  it('extracts the last aer-plan and strips it from the reply', () => {
    const text = `${block({ tasks: [t('velho')] })}meio\n${block({ tasks: [t('A'), t('B', { dependsOn: [1], kind: 'test', prefer: 'kimi' })] })}fim`;
    const r = parseMainReply(text);
    expect(r.error).toBeUndefined();
    expect(r.plan!.tasks.map((x) => x.title)).toEqual(['A', 'B']);
    expect(r.plan!.tasks[1]).toMatchObject({ dependsOn: [1], kind: 'test', prefer: 'kimi' });
    expect(r.reply).not.toContain('aer-plan');
    expect(r.reply).toContain('fim');
  });
  it('plain reply has no plan and no error', () => {
    expect(parseMainReply('só conversa')).toEqual({ reply: 'só conversa' });
  });
  it('rejects invalid JSON, out-of-range dependsOn and cycles', () => {
    expect(parseMainReply('```aer-plan\n{ nope\n```').error).toMatch(/JSON/);
    expect(parseMainReply(block({ tasks: [t('A'), t('B', { dependsOn: [4] })] })).error).toMatch(/dependsOn 4/);
    expect(parseMainReply(block({ tasks: [t('A', { dependsOn: [2] }), t('B', { dependsOn: [1] })] })).error).toMatch(/ciclo/);
    expect(parseMainReply(block({ tasks: [t('A', { dependsOn: [1] })] })).error).toMatch(/ciclo/);
    expect(parseMainReply(block({ tasks: [] })).error).toMatch(/1 a 12/);
    expect(parseMainReply(block({ tasks: [{ title: '', instructions: 'x' }] })).error).toMatch(/title/);
    expect(parseMainReply(block({ tasks: [t('A', { kind: 'magic' })] })).error).toMatch(/kind/);
  });
});

describe('provider assignment (PHASE-18, TAR-0082)', () => {
  const plan = (n: number, extra: Record<string, unknown>[] = []) => ({ tasks: Array.from({ length: n }, (_, i) => ({ ...t(`T${i + 1}`), kind: 'code' as const, dependsOn: [] as number[], ...(extra[i] ?? {}) })) });
  it('never assigns the main when another IA is ready', () => {
    const r = assignProviders(plan(3), { ...base, ready: ['claude', 'codex', 'kimi'], main: 'claude' });
    expect(r.tasks.map((x) => x.provider)).toEqual(['codex', 'kimi', 'codex']);
    expect(r.reasons).toHaveLength(3);
  });
  it('honors prefer when free, otherwise least busy, with reasons', () => {
    const r = assignProviders(plan(2, [{ prefer: 'kimi' }, { prefer: 'kimi' }]), { ...base, ready: ['claude', 'codex', 'kimi'], main: 'claude' });
    expect(r.tasks.map((x) => x.provider)).toEqual(['kimi', 'codex']);
    expect(r.reasons[0]).toBe('kimi: preferida pela principal');
    expect(r.reasons[1]).toBe('codex: a menos ocupada');
    const busy = assignProviders(plan(1), { ...base, ready: ['claude', 'codex', 'kimi'], main: 'claude', busy: { codex: 1 } });
    expect(busy.tasks[0]!.provider).toBe('kimi');
  });
  it('falls back to the main only when it is the only ready IA', () => {
    const r = assignProviders(plan(2), { ...base, ready: ['claude'], main: 'claude' });
    expect(r.tasks.map((x) => x.provider)).toEqual(['claude', 'claude']);
    expect(r.reasons[0]).toBe('claude: única IA disponível (principal)');
  });
  it('throws NO_PROVIDER when nothing is ready', () => {
    expect(() => assignProviders(plan(1), { ...base, ready: [], main: 'claude' })).toThrow(/nenhuma IA pronta/);
  });
  it('a prefer outside the ready list is ignored', () => {
    expect(assignProviders(plan(1, [{ prefer: 'google' }]), { ...base, ready: ['claude', 'codex'], main: 'claude' }).tasks[0]!.provider).toBe('codex');
  });
});
