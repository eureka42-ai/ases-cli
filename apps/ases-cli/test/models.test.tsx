import { describe, expect, it } from 'vitest';
import { KEYS, UiContext, renderForTest, type Ui } from '@aer/tui-shared';
import { listModels, type ModelList } from '../src/models.ts';
import { ModelPicker } from '../src/model-picker.tsx';

const run = (outputs: Record<string, string>) => async (cmd: string, args: string[]) => ({ exitCode: outputs[`${cmd} ${args.join(' ')}`] === undefined ? 1 : 0, stdout: outputs[`${cmd} ${args.join(' ')}`] ?? '' });

describe('model lists per AI (PHASE-20)', () => {
  it('claude: aliases from its help; codex/kimi: type the name; google and opencode: their own list commands', async () => {
    const r = run({ 'agy models': 'Fetching available models...\ngemini-4-neon-high\tGemini 4 Neon (High)\ngemini-4-argon-low\tGemini 4 Argon (Low)\n', 'opencode models': 'ollama/gpt-oss:20b\nopencode-go/glm-5.3\n' });
    expect((await listModels('claude', r)).models.map((m) => m.id)).toEqual(['fable', 'opus', 'sonnet']);
    const g = await listModels('google', r);
    expect(g).toMatchObject({ canSet: true, models: [{ id: 'gemini-4-neon-high', name: 'Gemini 4 Neon (High)' }, { id: 'gemini-4-argon-low', name: 'Gemini 4 Argon (Low)' }] });
    const o = await listModels('opencode', r);
    expect(o.canSet).toBe(false);
    expect(o.models.map((m) => m.id)).toEqual(['ollama/gpt-oss:20b', 'opencode-go/glm-5.3']);
    expect(o.note).toMatch(/opencode\.json/);
    expect(await listModels('codex', r)).toMatchObject({ canSet: true, models: [] });
    expect((await listModels('google', run({}))).note).toMatch(/não consegui listar/);
  });
});

const lists: ModelList[] = [
  { provider: 'claude', canSet: true, models: [{ id: 'fable', name: 'fable' }, { id: 'opus', name: 'opus' }], source: 'claude --help' },
  { provider: 'google', canSet: true, models: [{ id: 'gemini-4-neon-high', name: 'Gemini 4 Neon (High)' }], source: 'agy models' },
  { provider: 'opencode', canSet: false, models: [{ id: 'ollama/gpt-oss:20b', name: 'ollama/gpt-oss:20b' }], source: 'opencode models', note: 'edite model no opencode.json' },
];
const ui: Ui = { color: false, unicode: true, theme: 'green' };
const txt = (r: { lastFrame(): string }) => r.lastFrame().replace(/\u001b\[[0-9;]*m/g, '');

describe('model picker: ← → choose the AI, ↑ ↓ the model, Space selects (PHASE-20)', () => {
  it('navigates and selects; the current choice is marked; OpenCode explains why it cannot be set', async () => {
    const chosen: [string, string | null][] = [];
    let closed = false;
    const r = await renderForTest(<UiContext.Provider value={ui}><ModelPicker lists={lists} current={{ claude: 'opus' }} onChoose={(p, m) => chosen.push([p, m])} onClose={() => { closed = true; }} /></UiContext.Provider>, 100, 30);
    expect(txt(r)).toMatch(/\[ claude \]/);
    expect(txt(r)).toMatch(/● opus/); // escolha atual
    await r.press(KEYS.down);
    await r.press(KEYS.down); // padrão → fable → opus
    await r.press(' ');
    expect(chosen).toEqual([['claude', 'opus']]);
    await r.press(KEYS.up);
    await r.press(KEYS.up);
    await r.press(' '); // "padrão" limpa a escolha
    expect(chosen.at(-1)).toEqual(['claude', null]);
    await r.press('\u001b[C'); // →
    expect(txt(r)).toMatch(/\[ google \]/);
    await r.press(KEYS.down);
    await r.press(' ');
    expect(chosen.at(-1)).toEqual(['google', 'gemini-4-neon-high']);
    await r.press('\u001b[C');
    expect(txt(r)).toMatch(/\[ opencode \]/);
    expect(txt(r)).toContain('edite model no opencode.json');
    await r.press(KEYS.down);
    await r.press(' ');
    expect(chosen.at(-1)).toEqual(['google', 'gemini-4-neon-high']); // nada muda no OpenCode
    await r.press('\u001b[D'); // ←
    expect(txt(r)).toMatch(/\[ google \]/);
    await r.press(KEYS.esc);
    expect(closed).toBe(true);
    r.unmount();
  });
});
