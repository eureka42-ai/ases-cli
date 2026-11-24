import { EventEmitter } from 'node:events';
import { Box, Text, render, useStdout, type Instance } from 'ink';
import { createContext, useContext, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { GLYPH_FALLBACK, THEMES, pickLogoMode, renderBanner, renderBrand, type AppName, type LogoMode, type ThemeName } from '@aer/branding';
import type { TaskState } from '@aer/contracts';

/** Capacidades de saída decididas uma vez por processo (NO_COLOR, TERM=dumb, Unicode) e compartilhadas pelas duas TUIs. */
export interface Ui {
  color: boolean;
  unicode: boolean;
  theme: ThemeName;
  logo?: LogoMode | undefined;
  colorDepth?: 0 | 4 | 8 | 24 | undefined;
}
export const UiContext = createContext<Ui>({ color: false, unicode: false, theme: 'teal' });
export const useUi = (): Ui => useContext(UiContext);

/** Cor só quando permitida: com NO_COLOR nenhum componente emite código de cor (AER-REQ-245). */
export function useColor(): (c: string | undefined) => { color?: string } {
  const ui = useUi();
  return (c) => (ui.color && c ? { color: c } : {});
}

export function useAccent(): string | undefined {
  const ui = useUi();
  return ui.color ? (THEMES[ui.theme].accent ?? undefined) : undefined;
}

/** Largura/altura atuais, atualizadas no resize (SIGWINCH no POSIX, evento do console no Windows). */
export function useTerminalSize(): { columns: number; rows: number } {
  const stdout = useStdout().stdout as NodeJS.WriteStream;
  const read = () => ({ columns: stdout.columns || 80, rows: stdout.rows || 24 });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const onResize = () => setSize(read());
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);
  return size;
}

export function BrandHeader({ app, columns, children, banner }: { app: AppName; columns: number; children?: ReactNode; banner?: { main?: string; ready?: number } }): ReactElement {
  const ui = useUi();
  const picked = pickLogoMode({ columns, unicode: ui.unicode }, ui.logo);
  // banner grande só onde foi pedido (o `ases`); sem Unicode, a versão ASCII, com a mesma largura mínima
  const wantsBanner = banner && columns >= 72 && (picked === 'banner' || (!ui.unicode && (!ui.logo || ui.logo === 'banner')));
  if (wantsBanner) {
    const text = renderBanner({ color: ui.color, unicode: ui.unicode, theme: ui.theme, ...(ui.colorDepth !== undefined ? { colorDepth: ui.colorDepth } : {}), ...(banner.main ? { main: banner.main } : {}), ...(banner.ready !== undefined ? { ready: banner.ready } : {}) });
    return (
      <Box flexDirection="column" width={columns} overflow="hidden">
        {text.split('\n').map((l, i) => <Text key={i} wrap="truncate-end">{l}</Text>)}
        {children ? <Box>{children}</Box> : null}
      </Box>
    );
  }
  // na TUI o cabeçalho nunca usa os modos de várias linhas sem pedido: compact ou menor
  const mode: LogoMode = picked === 'full' || picked === 'banner' ? 'compact' : picked;
  // ASCII completo tem 25+ colunas: em terminal estreito fica só "[E42] APP" para o estado caber na mesma linha
  const brand = mode === 'ascii' && columns < 60 ? `${GLYPH_FALLBACK} ${app}` : renderBrand({ app, mode, theme: ui.theme, color: ui.color, ...(ui.colorDepth !== undefined ? { colorDepth: ui.colorDepth } : {}) });
  return (
    <Box width={columns} overflow="hidden">
      <Box flexShrink={0}><Text>{brand}</Text></Box>
      {children ? <Box flexShrink={0}><Text> </Text></Box> : null}
      {children}
    </Box>
  );
}

export type LinkStatus = 'LIVE' | 'RECONNECTING' | 'OFFLINE' | 'STALE';
const LINK: Record<LinkStatus, { u: string; a: string; color: string }> = {
  LIVE: { u: '●', a: '*', color: 'green' },
  RECONNECTING: { u: '◌', a: '~', color: 'yellow' },
  STALE: { u: '◐', a: '?', color: 'yellow' },
  OFFLINE: { u: '○', a: '-', color: 'red' },
};

/** Estado de conexão distinguível por símbolo e rótulo, não só por cor (§11.6). */
export function StatusBadge({ status }: { status: LinkStatus }): ReactElement {
  const ui = useUi();
  const c = useColor();
  const s = LINK[status];
  return <Box flexShrink={0}><Text {...c(s.color)} bold>{`${ui.unicode ? s.u : s.a} ${status}`}</Text></Box>;
}

const STATE_COLOR: Partial<Record<TaskState, string>> = {
  READY: 'cyan', RESERVED: 'cyan', RUNNING: 'blue', VERIFYING: 'blue', REVIEW: 'magenta', APPROVED: 'magenta', MERGING: 'magenta',
  COMPLETED: 'green', FAILED: 'red', CONFLICT: 'red', BLOCKED: 'yellow', PAUSED: 'yellow', CANCEL_REQUESTED: 'yellow', CANCELLED: 'gray',
};
export function StateText({ state, width = 0 }: { state: string; width?: number }): ReactElement {
  const c = useColor();
  return <Text {...c(STATE_COLOR[state as TaskState])}>{state.padEnd(width)}</Text>;
}

export function Pane({ title, focused = false, width, height, flexGrow, children }: { title: string; focused?: boolean; width?: number | string; height?: number; flexGrow?: number; children?: ReactNode }): ReactElement {
  const ui = useUi();
  const accent = useAccent();
  return (
    <Box flexDirection="column" borderStyle={ui.unicode ? 'round' : 'classic'} borderColor={focused ? accent : undefined} paddingX={1} overflow="hidden" {...(width !== undefined ? { width } : {})} {...(height !== undefined ? { height } : {})} {...(flexGrow !== undefined ? { flexGrow } : {})}>
      <Text bold {...(focused && accent ? { color: accent } : {})}>{`${focused ? (ui.unicode ? '▸ ' : '> ') : ''}${title}`}</Text>
      {children}
    </Box>
  );
}

export function KeyHints({ hints }: { hints: [string, string][] }): ReactElement {
  const ui = useUi();
  return <Text dimColor wrap="truncate-end">{hints.map(([k, d]) => `${ui.unicode ? k : k.replace('↑↓', 'up/dn').replace('↑ ↓', 'up/dn').replace('×', 'x')} ${d}`).join(symbols(ui.unicode).sep)}</Text>;
}

export function HelpOverlay({ title, keys }: { title: string; keys: [string, string][] }): ReactElement {
  return (
    <Pane title={`${title} ${symbols(useUi().unicode).dash} atalhos (Esc fecha)`} focused>
      {keys.map(([k, d]) => (
        <Text key={k} wrap="truncate-end">
          <Text bold>{(useUi().unicode ? k : k.replace('↑ ↓', 'up dn').replace('×', 'x')).padEnd(12)}</Text>
          {d}
        </Text>
      ))}
    </Pane>
  );
}

/** Corta texto à largura disponível sem quebrar a linha (logs nunca quebram o layout, §11.6). */
export const clip = (s: string, width: number): string => ([...s].length <= width ? s : `${[...s].slice(0, Math.max(0, width - 1)).join('')}…`);

// ---------- teste: renderização com largura fixa, sem TTY real ----------

class FakeStdout extends EventEmitter {
  columns: number;
  rows: number;
  frames: string[] = [];
  isTTY = true;
  constructor(columns: number, rows: number) {
    super();
    this.columns = columns;
    this.rows = rows;
  }
  write = (s: string): boolean => {
    this.frames.push(s);
    return true;
  };
}

class FakeStdin extends EventEmitter {
  isTTY = true;
  private queue: string[] = [];
  setRawMode(): void {}
  setEncoding(): void {}
  ref(): void {}
  unref(): void {}
  resume(): void {}
  pause(): void {}
  read = (): string | null => this.queue.shift() ?? null;
  press(data: string): void {
    this.queue.push(data);
    this.emit('readable');
  }
}

export interface TestRender {
  lastFrame(): string;
  press(keys: string): Promise<void>;
  resize(columns: number, rows: number): Promise<void>;
  unmount(): void;
  instance: Instance;
}

const tick = () => new Promise((r) => setTimeout(r, 20));

/** Renderiza um elemento Ink num stdout falso com largura/altura dadas (golden tests de layout). */
export async function renderForTest(el: ReactElement, columns = 80, rows = 24): Promise<TestRender> {
  const stdout = new FakeStdout(columns, rows);
  const stdin = new FakeStdin();
  const instance = render(el, {
    stdout: stdout as unknown as NodeJS.WriteStream, stdin: stdin as unknown as NodeJS.ReadStream, stderr: stdout as unknown as NodeJS.WriteStream,
    debug: true, exitOnCtrlC: false, patchConsole: false,
  });
  await tick();
  return {
    instance,
    lastFrame: () => stdout.frames.at(-1) ?? '',
    press: async (keys) => {
      stdin.press(keys);
      await tick();
    },
    resize: async (c, r) => {
      stdout.columns = c;
      stdout.rows = r;
      stdout.emit('resize');
      await tick();
    },
    unmount: () => instance.unmount(),
  };
}

export const KEYS = { up: '\u001b[A', down: '\u001b[B', enter: '\r', esc: '\u001b', tab: '\t', backspace: '\u007f', ctrlC: '\u0003', ctrlL: '\u000c' } as const;

/** Quebra cada linha em pedaços de no máximo `width` caracteres (sem estourar o painel). */
export function wrapLines(lines: readonly string[], width: number): string[] {
  const w = Math.max(1, width);
  return lines.flatMap((l) => {
    const chars = [...l];
    if (chars.length <= w) return [l];
    const out: string[] = [];
    for (let i = 0; i < chars.length; i += w) out.push(chars.slice(i, i + w).join(''));
    return out;
  });
}

/** Símbolos dos textos da TUI; no modo ASCII nenhum caractere fora de 0x20–0x7E (AER-REQ-241). */
export function symbols(unicode: boolean) {
  return unicode
    ? { sep: ' · ', updown: '↑↓', dash: '—', more: '…', select: '›', cursor: '█' }
    : { sep: ' | ', updown: 'up/dn', dash: '-', more: '...', select: '>', cursor: '_' };
}
