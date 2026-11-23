import { Box, Text } from 'ink';
import { describe, expect, it } from 'vitest';
import { stripAnsi } from '@aer/branding';
import { BrandHeader, HelpOverlay, Pane, StatusBadge, UiContext, clip, renderForTest, useTerminalSize, wrapLines, type Ui } from '../src/index.tsx';

const COLOR: Ui = { color: true, unicode: true, theme: 'teal' };
const PLAIN: Ui = { color: false, unicode: true, theme: 'teal' };
const ASCII: Ui = { color: false, unicode: false, theme: 'teal' };
const ESC_COLOR = /\u001b\[(3[0-9]|9[0-7]|38;)/; // códigos de cor de primeiro plano

function Demo() {
  const { columns } = useTerminalSize();
  return (
    <Box flexDirection="column">
      <BrandHeader app="ASES-TAR" columns={columns}><StatusBadge status="LIVE" /></BrandHeader>
      <Pane title="Eventos" focused><Text>{`largura ${columns}`}</Text></Pane>
    </Box>
  );
}
const withUi = (ui: Ui) => <UiContext.Provider value={ui}><Demo /></UiContext.Provider>;

describe('tui-shared (TAR-0016)', () => {
  it('renders brand + badge; no color codes when color is off (AER-REQ-245)', async () => {
    const plain = await renderForTest(withUi(PLAIN), 80, 10);
    expect(plain.lastFrame()).toContain('⌘ Eureka42 | ASES-TAR ● LIVE');
    expect(plain.lastFrame()).not.toMatch(ESC_COLOR);
    const plainFrame = plain.lastFrame();
    plain.unmount();
    const color = await renderForTest(withUi(COLOR), 80, 10);
    expect(color.lastFrame()).toMatch(ESC_COLOR);
    expect(stripAnsi(color.lastFrame())).toBe(plainFrame);
    color.unmount();
  });

  it('ASCII fallback: [E42], ASCII badge symbol and classic borders (AER-REQ-241)', async () => {
    const r = await renderForTest(withUi(ASCII), 80, 10);
    expect(r.lastFrame()).toContain('[E42] Eureka42 | ASES-TAR * LIVE');
    expect(r.lastFrame()).toMatch(/^\+-+\+$/m);
    expect(r.lastFrame()).not.toMatch(/[╭╮╰╯●⌘]/);
    r.unmount();
  });

  it('status is distinguishable without color (§11.6)', async () => {
    const frames: string[] = [];
    for (const s of ['LIVE', 'RECONNECTING', 'OFFLINE', 'STALE'] as const) {
      const r = await renderForTest(<UiContext.Provider value={PLAIN}><StatusBadge status={s} /></UiContext.Provider>, 40, 3);
      frames.push(r.lastFrame().trim());
      r.unmount();
    }
    expect(frames).toEqual(['● LIVE', '◌ RECONNECTING', '○ OFFLINE', '◐ STALE']);
  });

  it('re-renders on resize and never exceeds the width (AER-REQ-201, AER-REQ-244)', async () => {
    const r = await renderForTest(withUi(PLAIN), 120, 10);
    expect(r.lastFrame()).toContain('largura 120');
    for (const cols of [80, 50, 40]) {
      await r.resize(cols, 10);
      expect(r.lastFrame()).toContain(`largura ${cols}`);
      for (const line of r.lastFrame().split('\n')) expect([...line].length).toBeLessThanOrEqual(cols);
    }
    expect(r.lastFrame()).toContain('⌘ E42 ● LIVE'); // 40 colunas → minimal
    r.unmount();
  });

  it('help overlay lists keys; clip truncates with ellipsis', async () => {
    const r = await renderForTest(<UiContext.Provider value={PLAIN}><HelpOverlay title="ases-tar" keys={[['Tab', 'troca painel'], ['q', 'sair']]} /></UiContext.Provider>, 60, 8);
    expect(r.lastFrame()).toMatch(/Tab\s+troca painel/);
    r.unmount();
    expect(clip('abcdef', 4)).toBe('abc…');
    expect(clip('abc', 4)).toBe('abc');
    expect(wrapLines(['abcdefg', 'xy'], 3)).toEqual(['abc', 'def', 'g', 'xy']);
    expect(wrapLines(['ç⌘ãé'], 2)).toEqual(['ç⌘', 'ãé']);
  });
});
