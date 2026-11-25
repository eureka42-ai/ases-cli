import { describe, expect, it } from 'vitest';
import { THINKING_WORDS, activityText, changesText, parseOutput, renderEntries, thinkingParts } from '../src/chat-format.ts';

const plain = (lines: ReturnType<typeof renderEntries>) => lines.map((l) => l.segments.map((s) => s.text).join(''));

describe('chat formatting in the Claude Code style (PHASE-19)', () => {
  it('splits a command output into the reply, activities with their diff, system lines and errors', () => {
    const out = 'claude> Pronto, ajustei o README.\n● Editou README.md (+1 −1)\n    - # velho\n    + # novo\nPlano PLN-0001 (2 tarefas):\n  1. Testes → codex\nerro CONSENT_REQUIRED: autorize';
    expect(parseOutput(out, ['claude', 'codex']).map((e) => [e.kind, e.who ?? '', e.text])).toEqual([
      ['main', 'claude', 'Pronto, ajustei o README.'],
      ['activity', '', 'Editou README.md (+1 −1)\n    - # velho\n    + # novo'],
      ['system', '', 'Plano PLN-0001 (2 tarefas):\n  1. Testes → codex'],
      ['error', '', 'erro CONSENT_REQUIRED: autorize'],
    ]);
    expect(parseOutput('  TAR-0001 codex RUNNING', ['codex'])).toEqual([{ kind: 'progress', text: '  TAR-0001 codex RUNNING' }]);
  });

  it('your message starts with > in gray; the reply starts with a green ●; a blank line between them', () => {
    const lines = renderEntries([{ kind: 'user', text: 'olá' }, { kind: 'main', who: 'claude', text: 'oi\nsegunda linha' }], 40, true);
    expect(plain(lines)).toEqual(['> olá', ' ', '● oi', '  segunda linha']);
    expect(lines[0]!.color).toBe('gray');
    expect(lines[2]!.segments[0]).toMatchObject({ text: '● ', color: 'green' });
    expect(plain(renderEntries([{ kind: 'main', text: 'x' }], 20, false))[0]).toBe('* x');
  });

  it('activities have an orange ●; added lines are green and removed lines red', () => {
    const lines = renderEntries([{ kind: 'activity', text: 'Editou README.md (+1 −1)\n    - # velho\n    + # novo' }], 40, true);
    expect(plain(lines)).toEqual(['● Editou README.md (+1 −1)', '    - # velho', '    + # novo']);
    expect(lines[0]!.segments[0]).toMatchObject({ text: '● ', color: 'orange' });
    expect(lines[1]!.color).toBe('red');
    expect(lines[2]!.color).toBe('green');
  });

  it('lists, bold and code blocks are formatted; long lines wrap by word with indent', () => {
    const lines = renderEntries([{ kind: 'main', who: 'claude', text: 'Plano:\n- **testes** de unidade\n```\nnpm test\n```\n' + 'palavra '.repeat(12).trim() }], 30, true);
    const p = plain(lines);
    expect(p).toContain('    • testes de unidade');
    expect(lines.find((l) => l.segments.some((s) => s.text === 'testes'))!.segments.find((s) => s.text === 'testes')!.bold).toBe(true);
    expect(lines.find((l) => plain([l])[0]!.includes('npm test'))!.dim).toBe(true);
    expect(p.some((l) => l.includes('```'))).toBe(false);
    for (const l of p) expect([...l].length).toBeLessThanOrEqual(30);
    expect(p.filter((l) => l.startsWith('  palavra')).length).toBeGreaterThan(1);
  });

  it('errors are red and progress is dim', () => {
    expect(renderEntries([{ kind: 'error', text: 'erro X: y' }], 40, true)[0]!.color).toBe('red');
    expect(renderEntries([{ kind: 'progress', text: '  TAR-0001 codex RUNNING' }], 40, true)[0]!.dim).toBe(true);
  });

  it('agent events become live activity lines in Portuguese', () => {
    expect(activityText({ type: 'tool_call', name: 'Read', safeArguments: { file_path: 'src/app.ts' } })).toBe('Lendo src/app.ts');
    expect(activityText({ type: 'tool_call', name: 'Grep', safeArguments: { pattern: 'TODO' } })).toBe('Procurando TODO');
    expect(activityText({ type: 'tool_call', name: 'write_file', safeArguments: { path: 'a.md' } })).toBe('Escrevendo a.md');
    expect(activityText({ type: 'file_change', relativePath: 'README.md', kind: 'modify' })).toBe('Editando README.md');
    expect(activityText({ type: 'message', text: 'x', visibleToUser: true })).toBeUndefined();
  });

  it('what changed: one line per file with +/−, then the changed lines (at most 12 per file)', () => {
    const patch = Array.from({ length: 20 }, (_, i) => `+linha ${i}`).join('\n');
    const t = changesText([{ file: 'a.txt', added: 20, removed: 0, patch }, { file: 'b.txt', added: 1, removed: 1, patch: '-x\n+y' }]).split('\n');
    expect(t[0]).toBe('● Editou a.txt (+20 −0)');
    expect(t.filter((l) => l.startsWith('    +linha'))).toHaveLength(12);
    expect(t).toContain('    … mais 8 linhas');
    expect(t).toContain('● Editou b.txt (+1 −1)');
    expect(t).toContain('    -x');
  });

  it('the thinking line has a creative orange word, the running time and how to interrupt', () => {
    const t = { provider: 'claude', since: 1_000, recent: ['Lendo src/app.ts'] };
    const p = thinkingParts(t, 19_400, true);
    expect(THINKING_WORDS).toContain(p.word.replace('…', ''));
    expect(p.glyph).toBe('✻');
    expect(p.rest).toBe('(claude · 18 s · Lendo src/app.ts · Esc para interromper)');
    expect(thinkingParts(t, 1_000, false).glyph).toBe('*');
    expect(thinkingParts(t, 1_000, true).word).not.toBe(thinkingParts(t, 9_500, true).word); // a palavra muda com o tempo
  });
});
