import { Box, Text, render, useApp, useInput } from 'ink';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { BrandHeader, HelpOverlay, KeyHints, Pane, StateText, StatusBadge, UiContext, symbols, useAccent, useTerminalSize, useUi, wrapLines, type Ui } from '@aer/tui-shared';
import { handleLine } from './commands.ts';
import type { Engine } from './engine.ts';

/** O que a TUI precisa do engine; o Engine real satisfaz isto e os testes usam o mesmo Engine sobre um projeto temporário. */
type EngineLike = Pick<Engine, 'info' | 'store' | 'onChange' | 'mirrorError'> & Parameters<typeof handleLine>[0];

const MAX_LOG = 1000;
const KEYS: [string, string][] = [
  ['Enter', 'executa o comando do prompt'],
  ['↑ ↓', 'histórico de comandos (prompt) / seleção (tarefas)'],
  ['Tab', 'alterna foco: prompt / tarefas'],
  ['Enter (tarefas)', 'mostra o detalhe da tarefa selecionada'],
  ['Ctrl+L', 'limpa a área da sessão (não apaga histórico persistido)'],
  ['?', 'esta ajuda (com prompt vazio)'],
  ['Esc', 'fecha a ajuda / volta ao prompt'],
  ['Ctrl+C ×2', 'sai: o engine é encerrado (nenhuma tarefa em execução nesta versão)'],
];

export function AsesApp({ engine, onExit }: { engine: EngineLike; onExit: (reason: string) => void }): ReactElement {
  const ui = useUi();
  const y = symbols(ui.unicode);
  const accent = useAccent();
  const app = useApp();
  const { columns, rows } = useTerminalSize();
  const [, setTick] = useState(0);
  const [log, setLog] = useState<string[]>(['Bem-vindo. Digite /help para os comandos; abra `ases-tar` noutro terminal para acompanhar.']);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const [focus, setFocus] = useState<'prompt' | 'tasks'>('prompt');
  const [sel, setSel] = useState(0);
  const [help, setHelp] = useState(false);
  const armed = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => engine.onChange(() => setTick((n) => n + 1)), [engine]);
  const push = (...lines: string[]) => setLog((cur) => [...cur, ...lines.flatMap((l) => l.split('\n'))].slice(-MAX_LOG));
  const exit = (reason: string) => {
    onExit(reason);
    app.exit();
  };
  const run = (line: string) => {
    push(`ases> ${line}`);
    try {
      const out = handleLine(engine, line, ui.unicode);
      if (out === 'EXIT') return exit('/exit');
      if (out) push(out);
    } catch (err) {
      const e = err as Error & { code?: string };
      push(`erro${e.code ? ` ${e.code}` : ''}: ${e.message}`);
    }
  };
  const tasks = engine.store.listTasks();

  useInput((ch, key) => {
    if (key.ctrl && ch === 'c') {
      // §6.4: primeiro Ctrl+C avisa; o segundo (em até 2 s) encerra
      if (armed.current) return exit('Ctrl+C');
      push('Ctrl+C de novo em 2 s para sair: o engine será encerrado (nenhuma tarefa está em execução nesta versão).');
      armed.current = setTimeout(() => {
        armed.current = undefined;
      }, 2000);
      return;
    }
    if (help) {
      if (key.escape || ch === '?') setHelp(false);
      return;
    }
    if (key.ctrl && ch === 'l') return setLog([]);
    if (key.tab) return setFocus((f) => (f === 'prompt' ? 'tasks' : 'prompt'));
    if (key.escape) return setFocus('prompt');
    if (focus === 'tasks') {
      if (ch === '?') return setHelp(true);
      if (key.upArrow) setSel((i) => Math.max(0, i - 1));
      if (key.downArrow) setSel((i) => Math.min(Math.max(0, tasks.length - 1), i + 1));
      if (key.return && tasks[sel]) run(`/task ${tasks[sel]!.id}`);
      return;
    }
    if (key.return) {
      const line = input.trim();
      setInput('');
      setHIdx(-1);
      if (!line) return;
      setHistory((h) => [...h.filter((x) => x !== line), line].slice(-200));
      run(line);
      return;
    }
    if (key.upArrow || key.downArrow) {
      if (!history.length) return;
      const next = key.upArrow ? (hIdx < 0 ? history.length - 1 : Math.max(0, hIdx - 1)) : hIdx < 0 ? -1 : hIdx + 1;
      if (next < 0 || next >= history.length) {
        setHIdx(-1);
        setInput('');
      } else {
        setHIdx(next);
        setInput(history[next]!);
      }
      return;
    }
    if (key.backspace || key.delete) return setInput((s) => [...s].slice(0, -1).join(''));
    if (ch === '?' && input === '') return setHelp(true);
    // só texto imprimível (colar várias linhas vira um comando por linha)
    if (ch && !key.ctrl && !key.meta) {
      const parts = ch.replace(/\r\n?/g, '\n').split('\n');
      if (parts.length > 1) {
        const first = input + parts[0];
        if (first.trim()) run(first.trim());
        for (const p of parts.slice(1, -1)) if (p.trim()) run(p.trim());
        setInput(parts.at(-1) ?? '');
      } else setInput((s) => s + ch.replace(/[\u0000-\u001f\u007f]/g, ''));
    }
  });

  const info = engine.info;
  const wide = columns >= 100;
  const bodyRows = Math.max(3, rows - 4); // cabeçalho + prompt + rodapé + margem
  const visible = Math.max(1, bodyRows - 3);
  const sideWidth = Math.min(48, Math.floor(columns * 0.38));
  const logWidth = wide ? columns - sideWidth : columns;

  const header = (
    <BrandHeader app="ASES CLI" columns={columns}>
      <StatusBadge status="LIVE" />
      <Text wrap="truncate-end">{`  ${info.name}${y.sep}seq ${info.lastSeq}${y.sep}monitores ${info.monitors}${engine.mirrorError ? `${y.sep}ESPELHO PENDENTE` : ''}`}</Text>
    </BrandHeader>
  );
  const logPane = (
    <Pane title="Sessão" focused={focus === 'prompt'} height={bodyRows} width={logWidth}>
      {wrapLines(log.slice(-visible), logWidth - 4).slice(-visible).map((l, i) => <Text key={`${log.length}-${i}`} wrap="truncate-end">{l}</Text>)}
    </Pane>
  );
  const sideLines: ReactElement[] = [];
  for (const p of engine.store.listPhases()) {
    sideLines.push(<Text key={p.id} bold wrap="truncate-end">{`${p.id} `}<StateText state={p.state} />{` ${p.title}`}</Text>);
    for (const t of tasks.filter((x) => x.phaseId === p.id)) {
      const isSel = focus === 'tasks' && tasks[sel]?.id === t.id;
      sideLines.push(<Text key={t.id} wrap="truncate-end" inverse={isSel}>{`${isSel ? y.select : ' '} ${t.id} `}<StateText state={t.state} />{` ${t.title}`}</Text>);
    }
  }
  const selLine = sideLines.findIndex((l) => l.key === tasks[sel]?.id);
  const start = Math.max(0, Math.min(selLine - visible + 1, sideLines.length - visible));
  const side = (
    <Pane title={`Fases e tarefas (${tasks.length})`} focused={focus === 'tasks'} height={bodyRows} width={sideWidth}>
      {sideLines.length ? sideLines.slice(start, start + visible) : <Text dimColor>(nenhuma; /phase new &lt;título&gt;)</Text>}
    </Pane>
  );
  const body = help ? <HelpOverlay title="ases" keys={KEYS} /> : wide ? <Box>{logPane}{side}</Box> : focus === 'tasks' ? side : logPane;
  const cursor = y.cursor;
  return (
    <Box flexDirection="column" width={columns}>
      {header}
      {body}
      <Text wrap="truncate-start">
        <Text bold {...(accent ? { color: accent } : {})}>ases&gt; </Text>
        {`${input}${focus === 'prompt' ? cursor : ''}`}
      </Text>
      <KeyHints hints={[['Enter', 'executar'], [y.updown, 'histórico'], ['Tab', 'tarefas'], ['?', 'ajuda'], ['Ctrl+L', 'limpar'], [ui.unicode ? 'Ctrl+C×2' : 'Ctrl+Cx2', 'sair']]} />
    </Box>
  );
}

/** Roda a TUI até o usuário sair; devolve o motivo para a mensagem final (impressa fora do Ink). */
export async function runTui(engine: Engine, ui: Ui): Promise<string> {
  let reason = 'saída';
  const instance = render(<UiContext.Provider value={ui}><AsesApp engine={engine} onExit={(r) => { reason = r; }} /></UiContext.Provider>, { exitOnCtrlC: false });
  const onTerm = () => {
    reason = 'SIGTERM';
    instance.unmount();
  };
  process.once('SIGTERM', onTerm);
  await instance.waitUntilExit();
  process.off('SIGTERM', onTerm);
  return reason;
}
