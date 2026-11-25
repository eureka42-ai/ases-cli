import { Box, Text, render, useApp, useInput } from 'ink';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { BrandHeader, HelpOverlay, KeyHints, Pane, StateText, StatusBadge, UiContext, symbols, useAccent, useTerminalSize, useUi, type Ui } from '@aer/tui-shared';
import { handleLine } from './commands.ts';
import { chatSession, filterMenu } from './chat-commands.ts';
import { activityText, parseOutput, renderEntries, thinkingParts, type Color, type Entry, type Thinking } from './chat-format.ts';
import { useNow } from './ticker.ts';
import { ModelPicker } from './model-picker.tsx';
import type { ModelList } from './models.ts';
import { chosenModels, setChosenModel } from '@aer/project-store';
import type { Engine } from './engine.ts';

/** O que a TUI precisa do engine; o Engine real satisfaz isto e os testes usam o mesmo Engine sobre um projeto temporário. */
type EngineLike = Pick<Engine, 'info' | 'store' | 'onChange' | 'mirrorError' | 'runningTasks'> & Parameters<typeof handleLine>[0];

const MAX_LOG = 1000;
const KEYS: [string, string][] = [
  ['Enter', 'envia a mensagem à principal ou executa o /comando; com plano pendente e prompt vazio, executa o plano'],
  ['Ctrl+E / Ctrl+N', 'com plano pendente: editar o item 1 / descartar o plano'],
  ['/', 'abre o menu de comandos (↑↓ escolhe, Tab completa)'],
  ['↑ ↓', 'histórico de comandos (prompt) / seleção (tarefas)'],
  ['Tab', 'alterna foco: prompt / tarefas'],
  ['Enter (tarefas)', 'mostra o detalhe da tarefa selecionada'],
  ['Ctrl+L', 'limpa a área da sessão (não apaga histórico persistido)'],
  ['?', 'esta ajuda (com prompt vazio)'],
  ['Esc', 'fecha a ajuda / volta ao prompt'],
  ['Ctrl+C ×2', 'sai: tarefas em execução são canceladas (árvore de processos encerrada) e o engine é encerrado'],
];

export function AsesApp({ engine, onExit }: { engine: EngineLike; onExit: (reason: string) => void }): ReactElement {
  const ui = useUi();
  const y = symbols(ui.unicode);
  const accent = useAccent();
  const app = useApp();
  const { columns, rows } = useTerminalSize();
  const [, setTick] = useState(0);
  const [log, setLog] = useState<Entry[]>([{ kind: 'system', text: 'Bem-vindo. Converse com a IA principal em texto livre; /ajuda mostra os comandos. Abra `ases-tar` noutro terminal para acompanhar.' }]);
  const [thinking, setThinking] = useState<Thinking | undefined>(undefined);
  const [picker, setPicker] = useState<ModelList[] | undefined>(undefined);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const [focus, setFocus] = useState<'prompt' | 'tasks'>('prompt');
  const [sel, setSel] = useState(0);
  const [help, setHelp] = useState(false);
  const [menuSel, setMenuSel] = useState(0);
  const [consentAsk, setConsentAsk] = useState<{ provider: string; message: string } | undefined>(undefined);
  const [ready, setReady] = useState<number | undefined>(undefined);
  const armed = useRef<NodeJS.Timeout | undefined>(undefined);
  const chat = chatSession(engine as Engine);

  useEffect(() => engine.onChange(() => setTick((n) => n + 1)), [engine]);
  useEffect(() => {
    // progresso das tarefas do plano no próprio chat; IAs prontas para o banner
    chat.on({
      onProgress: (p) => add({ kind: 'progress', text: `  ${p.taskId} ${p.provider.padEnd(12)} ${p.state}${p.note ? ` · ${p.note}` : ''}` }),
      // cada coisa que a IA faz aparece na hora na conversa ("● Lendo src/app.ts") e na linha de "pensando"
      onAgentEvent: (ev) => {
        const what = activityText(ev);
        if (!what) return;
        add({ kind: 'activity', text: what });
        setThinking((t) => (t ? { ...t, recent: [...t.recent, what].slice(-2) } : t));
      },
    });
    let alive = true;
    void chat.probeAll().then((pr) => alive && setReady(Object.values(pr).filter((x) => x.availability === 'READY').length), () => undefined);
    return () => {
      alive = false;
    };
  }, [chat]);
  const add = (...entries: Entry[]) => setLog((cur) => [...cur, ...entries].slice(-MAX_LOG));
  /** Saída de um comando: separada em resposta da IA, erros, progresso e mensagens do sistema. */
  const push = (...texts: string[]) => add(...texts.flatMap((t) => parseOutput(t, Object.keys((engine as Engine).providers))));
  const exit = (reason: string) => {
    onExit(reason);
    app.exit();
  };
  const run = (line: string) => {
    // /modelo sem argumentos: seletor (← → IA, ↑ ↓ modelo, Espaço escolhe)
    if (/^\/(modelo|models)$/i.test(line.trim())) {
      add({ kind: 'user', text: line }, { kind: 'system', text: 'carregando a lista de modelos de cada IA…' });
      const ids = Object.keys((engine as Engine).providers).filter((p) => !p.startsWith('simulator'));
      void Promise.all(ids.map((p) => chat.models(p))).then(setPicker, (err: Error) => add({ kind: 'error', text: `erro: ${err.message}` }));
      return;
    }
    const isChat = !line.startsWith('/');
    if (isChat && chat.pending > 0) add({ kind: 'system', text: `na fila: ${line}` });
    else add({ kind: 'user', text: line });
    if (isChat) setThinking((t) => t ?? { provider: engine.store.currentConversation()?.main ?? chat.config().main ?? 'principal', since: Date.now(), recent: [] });
    try {
      const out = handleLine(engine, line, ui.unicode);
      if (out === 'EXIT') return exit('/exit');
      if (out instanceof Promise) {
        if (!isChat) push(`executando${y.more} (acompanhe no ases-tar; /parar para parar)`);
        out.then((text) => {
          if (isChat && chat.pending === 0) setThinking(undefined);
          push(text);
          const m = /erro CONSENT_REQUIRED: autorize o uso da sua conta ([a-z0-9-]+)/.exec(text);
          if (m && isChat) setConsentAsk({ provider: m[1]!, message: line });
        }, (err: Error & { code?: string }) => {
          if (isChat && chat.pending === 0) setThinking(undefined);
          push(`erro${err.code ? ` ${err.code}` : ''}: ${err.message}`);
        });
      } else if (out) push(out);
    } catch (err) {
      const e = err as Error & { code?: string };
      push(`erro${e.code ? ` ${e.code}` : ''}: ${e.message}`);
    }
  };
  const tasks = engine.store.listTasks();

  useInput((ch, key) => {
    if (picker) return; // o seletor de modelos tem o próprio teclado
    if (key.ctrl && ch === 'c') {
      // §6.4: primeiro Ctrl+C avisa; o segundo (em até 2 s) encerra
      if (armed.current) return exit('Ctrl+C');
      const busy = engine.runningTasks;
      push(`Ctrl+C de novo em 2 s para sair: ${busy.length ? `${busy.join(', ')} será(ão) cancelada(s) e ` : ''}o engine será encerrado.`);
      armed.current = setTimeout(() => {
        armed.current = undefined;
      }, 2000);
      return;
    }
    if (help) {
      if (key.escape || ch === '?') setHelp(false);
      return;
    }
    if (consentAsk) {
      // a conta (cota/cobrança) é do usuário: nada roda antes do "s" (AER-REQ-123)
      if (ch === 's' || ch === 'a') {
        if (ch === 'a') chat.setConsentAll(true);
        else chat.grantConsent(consentAsk.provider, false);
        push(ch === 'a' ? 'todas as IAs instaladas autorizadas neste computador (desligue com /config revogar todas)' : `${consentAsk.provider} autorizada nesta sessão`);
        const again = consentAsk.message;
        setConsentAsk(undefined);
        run(again);
      } else if (ch === 'n' || key.escape) {
        push(`${consentAsk.provider}: não autorizado; nada foi enviado. Troque a principal com /ia <nome>`);
        setConsentAsk(undefined);
      }
      return;
    }
    const plan = engine.store.currentConversation() ? engine.store.pendingPlan(engine.store.currentConversation()!.id) : undefined;
    // n/e soltos começam mensagens ("não", "explique"): o plano usa Ctrl+N/Ctrl+E (revisão final, I2)
    if (plan && focus === 'prompt') {
      if (key.return && input === '') return run('/plano executar');
      if (key.ctrl && ch === 'n') return run('/cancel');
      if (key.ctrl && ch === 'e') return setInput('/plano editar 1 provider=');
    }
    const menu = focus === 'prompt' && input.startsWith('/') && !input.includes(' ') ? filterMenu(input) : [];
    if (menu.length) {
      if (key.upArrow) return setMenuSel((i) => Math.max(0, i - 1));
      if (key.downArrow) return setMenuSel((i) => Math.min(menu.length - 1, i + 1));
      if (key.tab) {
        setInput(`${menu[Math.min(menuSel, menu.length - 1)]!.cmd} `);
        setMenuSel(0);
        return;
      }
    }
    if (key.ctrl && ch === 'l') return setLog([]);
    if (key.tab) return setFocus((f) => (f === 'prompt' ? 'tasks' : 'prompt'));
    if (key.escape && thinking) {
      void chat.stopTurn();
      add({ kind: 'system', text: 'interrompido pelo usuário (Esc)' });
      return;
    }
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
    if (key.backspace || key.delete) {
      setMenuSel(0);
      return setInput((s) => [...s].slice(0, -1).join(''));
    }
    if (ch === '?' && input === '') return setHelp(true);
    // só texto imprimível (colar várias linhas vira um comando por linha)
    if (ch && !key.ctrl && !key.meta) {
      const parts = ch.replace(/\r\n?/g, '\n').split('\n');
      if (parts.length > 1) {
        const first = input + parts[0];
        if (first.trim()) run(first.trim());
        for (const p of parts.slice(1, -1)) if (p.trim()) run(p.trim());
        setInput(parts.at(-1) ?? '');
      } else {
        setMenuSel(0);
        setInput((s) => s + ch.replace(/[\u0000-\u001f\u007f]/g, ''));
      }
    }
  });

  const now = useNow(thinking !== undefined, ui.animation === true);
  const info = engine.info;
  const wide = columns >= 100;
  const conv = engine.store.currentConversation();
  const mainName = conv?.main ?? chat.config().main ?? '…';
  const pendingPlan = conv ? engine.store.pendingPlan(conv.id) : undefined;
  const menuItems = focus === 'prompt' && input.startsWith('/') && !input.includes(' ') && !consentAsk ? filterMenu(input).slice(0, Math.max(3, Math.min(12, rows - 14))) : [];
  // banner grande só com espaço: 72+ colunas e altura para ainda caber a sessão
  const bannerOn = columns >= 72 && rows >= 24;
  const headerRows = bannerOn ? 8 : 1;
  const extraRows = menuItems.length + (consentAsk ? 1 : 0) + (pendingPlan && !consentAsk ? 1 : 0) + (thinking ? 1 : 0) + 2; // +2: moldura do prompt
  const bodyRows = Math.max(3, rows - 3 - headerRows - extraRows); // cabeçalho + prompt + rodapé + margem
  const visible = Math.max(1, bodyRows - 3);
  const sideWidth = Math.min(48, Math.floor(columns * 0.38));
  const logWidth = wide ? columns - sideWidth : columns;

  const header = (
    <BrandHeader app="ASES CLI" columns={columns} {...(bannerOn ? { banner: { main: mainName, ...(ready !== undefined ? { ready } : {}) } } : {})}>
      <StatusBadge status="LIVE" />
      <Text wrap="truncate-end">{`  ${info.name}${y.sep}seq ${info.lastSeq}${y.sep}monitores ${info.monitors}${engine.mirrorError ? `${y.sep}ESPELHO PENDENTE` : ''}`}</Text>
    </BrandHeader>
  );
  const hex: Record<Color, string> = { gray: 'gray', green: '#22C55E', red: 'red', orange: '#F97316' };
  const tint = (c: Color | undefined) => (ui.color && c ? { color: hex[c] } : {});
  // conversa sem moldura, como no Claude Code; só o painel de tarefas (tela larga) tem borda
  const logPane = (
    <Box flexDirection="column" height={bodyRows} width={logWidth} paddingX={1} overflow="hidden">
      {renderEntries(log.slice(-200), logWidth - 2, ui.unicode).slice(-(bodyRows)).map((l, i) => (
        <Text key={`${log.length}-${i}`} wrap="truncate-end" {...tint(l.color)} bold={l.bold ?? false} dimColor={ui.color && (l.dim ?? false)}>
          {l.segments.map((sg, k) => <Text key={k} bold={sg.bold ?? false} {...tint(sg.color)}>{sg.text}</Text>)}
        </Text>
      ))}
    </Box>
  );
  const sideLines: ReactElement[] = [];
  for (const p of engine.store.listPhases()) {
    sideLines.push(<Text key={p.id} bold wrap="truncate-end">{`${p.id} `}<StateText state={p.state} />{` ${p.title}`}</Text>);
    for (const t of tasks.filter((x) => x.phaseId === p.id)) {
      const isSel = focus === 'tasks' && tasks[sel]?.id === t.id;
      sideLines.push(<Text key={t.id} wrap="truncate-end" inverse={ui.color && isSel}>{`${isSel ? y.select : ' '} ${t.id} `}<StateText state={t.state} />{` ${t.title}`}</Text>);
    }
  }
  const selLine = sideLines.findIndex((l) => l.key === tasks[sel]?.id);
  const start = Math.max(0, Math.min(selLine - visible + 1, sideLines.length - visible));
  const side = (
    <Pane title={`Fases e tarefas (${tasks.length})`} focused={focus === 'tasks'} height={bodyRows} width={sideWidth}>
      {sideLines.length ? sideLines.slice(start, start + visible) : <Text dimColor>(nenhuma; /phase new &lt;título&gt;)</Text>}
    </Pane>
  );
  const body = picker ? (
    <ModelPicker lists={picker} current={chosenModels()}
      onChoose={(p, m) => { setChosenModel(p, m); add({ kind: 'system', text: `${p}: ${m ?? 'padrão (o da própria IA)'}` }); setTick((n) => n + 1); }}
      onType={(p) => { setPicker(undefined); setInput(`/modelo ${p} `); }}
      onClose={() => setPicker(undefined)} />
  ) : help ? <HelpOverlay title="ases" keys={KEYS} /> : wide ? <Box>{logPane}{side}</Box> : focus === 'tasks' ? side : logPane;
  const cursor = y.cursor;
  return (
    <Box flexDirection="column" width={columns}>
      {header}
      {body}
      {menuItems.map((m, i) => <Text key={m.cmd} wrap="truncate-end" inverse={ui.color && i === Math.min(menuSel, menuItems.length - 1)}>{`${i === Math.min(menuSel, menuItems.length - 1) ? (ui.unicode ? '›' : '>') : ' '} ${m.cmd.padEnd(11)} ${m.desc}`}</Text>)}
      {consentAsk ? <Text wrap="truncate-end" bold>{`Autorizar o uso da sua conta ${consentAsk.provider}? Ela usa a SUA cota. [s] só nesta sessão  [a] sempre, todas as IAs  [n] não`}</Text> : null}
      {thinking ? (() => {
        const t = thinkingParts(thinking, now, ui.unicode);
        return <Text wrap="truncate-end"><Text {...tint('orange')}>{`${t.glyph} `}</Text><Text bold {...tint('orange')}>{t.word}</Text><Text dimColor={ui.color}>{` ${t.rest}`}</Text></Text>;
      })() : null}
      {pendingPlan && !consentAsk ? <Text wrap="truncate-end">{`${pendingPlan.id} pendente: [Enter] executar  [Ctrl+E] editar  [Ctrl+N] descartar`}</Text> : null}
      <Box borderStyle={ui.unicode ? 'round' : 'classic'} borderDimColor={ui.color} width={columns} paddingX={1}>
        <Text wrap="truncate-start">
          <Text bold {...(accent ? { color: accent } : {})}>&gt; </Text>
          {`${input}${focus === 'prompt' ? cursor : ''}`}
        </Text>
      </Box>
      <KeyHints hints={[['Enter', 'enviar'], ['/', 'comandos'], [y.updown, 'histórico'], ['Tab', 'tarefas'], ['?', 'ajuda'], [ui.unicode ? 'Ctrl+C×2' : 'Ctrl+Cx2', 'sair']]} />
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
