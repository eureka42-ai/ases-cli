import { existsSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Box, Text, render, useInput } from 'ink';
import { useState, type ReactElement } from 'react';
import { BrandHeader, UiContext, useTerminalSize, useUi, type Ui } from '@aer/tui-shared';

// PHASE-19: ao abrir o `ases`, "Onde vamos trabalhar?". A pasta escolhida vira projeto sozinha (sem `ases init`).

const tilde = (p: string, home: string) => (p === home ? '~' : p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p);

export function startOptions(o: { cwd: string; home: string; desktop: string; recent: string[] }): { label: string; path?: string }[] {
  const out: { label: string; path?: string }[] = [];
  // a home não vira projeto; "esta pasta" só quando ela é outra
  if (path.resolve(o.cwd) !== path.resolve(o.home) && path.resolve(o.cwd) !== path.resolve(o.desktop)) out.push({ label: `Esta pasta (${tilde(o.cwd, o.home)})`, path: o.cwd });
  out.push({ label: `Mesa (${tilde(o.desktop, o.home)})`, path: o.desktop }, { label: 'Escolher uma pasta…' });
  for (const r of o.recent) if (path.resolve(r) !== path.resolve(o.cwd)) out.push({ label: `Recente: ${tilde(r, o.home)}`, path: r });
  return out;
}

export function StartScreen({ cwd, home, desktop, recent, onChoose }: { cwd: string; home: string; desktop: string; recent: string[]; onChoose: (p: string) => void }): ReactElement {
  const ui = useUi();
  const { columns } = useTerminalSize();
  const options = startOptions({ cwd, home, desktop, recent });
  const [sel, setSel] = useState(0);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  useInput((ch, key) => {
    if (typing) {
      if (key.return) {
        const raw = typed.trim();
        const p = path.resolve(cwd, raw.startsWith('~') ? path.join(home, raw.slice(1)) : raw);
        if (!raw || !existsSync(p) || !statSync(p).isDirectory()) return setError(`pasta não encontrada: ${raw || '(vazio)'}`);
        return onChoose(p);
      }
      if (key.escape) return setTyping(false);
      if (key.backspace || key.delete) return setTyped((t) => [...t].slice(0, -1).join(''));
      if (ch && !key.ctrl && !key.meta) {
        setError(undefined);
        setTyped((t) => t + ch.replace(/[\u0000-\u001f\u007f]/g, ''));
      }
      return;
    }
    if (key.upArrow) return setSel((i) => Math.max(0, i - 1));
    if (key.downArrow) return setSel((i) => Math.min(options.length - 1, i + 1));
    if (key.return) {
      const o = options[sel]!;
      if (o.path) return onChoose(o.path);
      setTyping(true);
    }
  });

  return (
    <Box flexDirection="column" width={columns}>
      <BrandHeader app="ASES CLI" columns={columns} banner={{}} />
      <Text bold>{'Onde vamos trabalhar?'}</Text>
      {typing ? (
        <Box flexDirection="column">
          <Text>{'Digite o caminho da pasta (~ é a sua pasta pessoal) e Enter; Esc volta:'}</Text>
          <Text>{`  > ${typed}${ui.unicode ? '█' : '_'}`}</Text>
          {error ? <Text {...(ui.color ? { color: 'red' } : {})}>{`  ${error}`}</Text> : null}
        </Box>
      ) : options.map((o, i) => <Text key={o.label} inverse={ui.color && i === sel}>{`  ${i === sel ? (ui.unicode ? '›' : '>') : ' '} ${o.label}`}</Text>)}
      <Text dimColor={ui.color}>{'A pasta escolhida vira um projeto do ASES sozinha (nada do que já existe é apagado).'}</Text>
    </Box>
  );
}

/** Mostra a tela e devolve a pasta escolhida. */
export async function runStartScreen(ui: Ui, o: { cwd: string; desktop: string; recent: string[] }): Promise<string | undefined> {
  let chosen: string | undefined;
  const instance = render(<UiContext.Provider value={ui}><StartScreen cwd={o.cwd} home={os.homedir()} desktop={o.desktop} recent={o.recent} onChoose={(p) => { chosen = p; instance.unmount(); }} /></UiContext.Provider>, { exitOnCtrlC: true });
  await instance.waitUntilExit();
  return chosen;
}
