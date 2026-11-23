import { Box, Text, render, useApp, useInput } from 'ink';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { EventEnvelope } from '@aer/contracts';
import type { Snapshot, TaskRow } from '@aer/persistence';
import { BrandHeader, HelpOverlay, KeyHints, Pane, StateText, StatusBadge, UiContext, symbols, useTerminalSize, useUi, type Ui } from '@aer/tui-shared';
import { formatEvent } from './format.ts';
import type { LinkStatus, Monitor, MonitorHandlers } from './monitor.ts';
import { applyEvent } from './projection.ts';

/** Fonte de dados da TUI: o Monitor real ou um falso nos testes. */
export interface MonitorLike {
  subscribe(h: { onStatus(s: LinkStatus, d: string): void; onSnapshot(s: Snapshot, recent: EventEnvelope[]): void; onEvent(e: EventEnvelope): void }): void;
  getTask(id: string): Promise<TaskRow | null>;
  reconnect(): void;
  stop(): void;
}

const MAX_EVENTS = 2000; // shortcut: histórico da timeline em memória; paginar via project.eventsSince quando o Replay (§11.3) entrar

const KEYS: [string, string][] = [
  ['Tab', 'alterna painel (tarefas / eventos)'],
  ['↑ ↓  j k', 'move a seleção / rola eventos'], // tecla exibida como 'up dn' no modo ASCII
  ['Enter', 'abre o detalhe da tarefa'],
  ['Esc', 'volta / fecha ajuda'],
  ['r', 'relê do engine (nunca reinicia execução)'],
  ['?', 'esta ajuda'],
  ['q  Ctrl+C', 'sai (o monitor é só leitura)'],
];

export function TarApp({ monitor, projectName, filter }: { monitor: MonitorLike; projectName: string; filter: { task?: string | undefined; phase?: string | undefined } }): ReactElement {
  const ui = useUi();
  const y = symbols(ui.unicode);
  const app = useApp();
  const { columns, rows } = useTerminalSize();
  const [status, setStatus] = useState<{ s: LinkStatus; d: string }>({ s: 'RECONNECTING', d: 'conectando' });
  const [snap, setSnap] = useState<Snapshot | undefined>();
  const [events, setEvents] = useState<EventEnvelope[]>([]);
  const [focus, setFocus] = useState<'tasks' | 'events'>('tasks');
  const [sel, setSel] = useState(0);
  const [scroll, setScroll] = useState(0);
  const [view, setView] = useState<'main' | 'detail' | 'help'>('main');
  const [detail, setDetail] = useState<TaskRow | undefined>();

  useEffect(() => {
    monitor.subscribe({
      onStatus: (s, d) => setStatus({ s, d }),
      onSnapshot: (s, recent) => {
        setSnap(s);
        setEvents(recent);
      },
      onEvent: (e) => {
        setSnap((cur) => (cur ? applyEvent(cur, e) : cur));
        setEvents((cur) => [...cur.slice(-(MAX_EVENTS - 1)), e]);
      },
    });
    return () => monitor.stop();
  }, [monitor]);

  const keep = (e: { taskId?: string | null; phaseId?: string | null; id?: string }) =>
    (!filter.task || (e.taskId ?? e.id) === filter.task) && (!filter.phase || e.phaseId === filter.phase);
  const tasks = useMemo(() => (snap?.tasks ?? []).filter((t) => keep({ id: t.id, phaseId: t.phaseId })), [snap, filter.task, filter.phase]);
  const shownEvents = useMemo(() => events.filter((e) => keep(e)), [events, filter.task, filter.phase]);
  const selected = tasks[Math.min(sel, tasks.length - 1)];

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      monitor.stop();
      app.exit();
      return;
    }
    if (view === 'help') {
      if (key.escape || input === '?') setView('main');
      return;
    }
    if (input === '?') return setView('help');
    if (input === 'r') return monitor.reconnect();
    if (view === 'detail') {
      if (key.escape) setView('main');
      return;
    }
    if (key.tab) return setFocus((f) => (f === 'tasks' ? 'events' : 'tasks'));
    const up = key.upArrow || input === 'k';
    const down = key.downArrow || input === 'j';
    if (focus === 'tasks') {
      if (up) setSel((i) => Math.max(0, i - 1));
      if (down) setSel((i) => Math.min(Math.max(0, tasks.length - 1), i + 1));
      if (key.return && selected) {
        setDetail(selected);
        setView('detail');
        void monitor.getTask(selected.id).then((t) => t && setDetail(t)).catch(() => undefined);
      }
    } else {
      if (up) setScroll((n) => Math.min(Math.max(0, shownEvents.length - 1), n + 1));
      if (down) setScroll((n) => Math.max(0, n - 1));
    }
  });

  const bodyRows = Math.max(3, rows - 3); // cabeçalho + rodapé
  const listRows = Math.max(1, bodyRows - 3); // bordas + título do painel
  const wide = columns >= 100;
  const leftWidth = Math.floor(columns * 0.45); // larguras numéricas: com flex, linhas longas de eventos espremiam as tarefas
  const live = status.s === 'LIVE';

  const header = (
    <BrandHeader app="ASES-TAR" columns={columns}>
      <StatusBadge status={status.s} />
      <Text wrap="truncate-end">{`  ${projectName}${y.sep}seq ${snap?.snapshotSeq ?? y.dash}${live ? '' : `${y.sep}${status.d}`}${filter.task ? `${y.sep}--task ${filter.task}` : ''}${filter.phase ? `${y.sep}--phase ${filter.phase}` : ''}`}</Text>
    </BrandHeader>
  );

  const taskLines: ReactElement[] = [];
  for (const phase of snap?.phases ?? []) {
    const own = tasks.filter((t) => t.phaseId === phase.id);
    if (filter.phase && phase.id !== filter.phase) continue;
    if (filter.task && own.length === 0) continue;
    const done = own.filter((t) => t.state === 'COMPLETED').length;
    taskLines.push(<Text key={phase.id} bold wrap="truncate-end">{`${phase.id} `}<StateText state={phase.state} />{` ${done}/${own.length}${y.sep}${phase.title}`}</Text>);
    for (const t of own) {
      const isSel = selected?.id === t.id && focus === 'tasks';
      taskLines.push(
        <Text key={t.id} wrap="truncate-end" inverse={isSel}>
          {`${isSel ? y.select : ' '} ${t.id} `}<StateText state={t.state} width={16} />{` ${t.title}`}
        </Text>,
      );
    }
  }
  // mantém a tarefa selecionada visível
  const selLine = taskLines.findIndex((l) => l.key === selected?.id);
  const start = Math.max(0, Math.min(selLine - listRows + 1, taskLines.length - listRows));
  const tasksPane = (
    <Pane title={`Fases e tarefas (${tasks.length})`} focused={focus === 'tasks'} height={bodyRows} width={wide ? leftWidth : columns}>
      {snap ? (taskLines.length ? taskLines.slice(Math.max(0, start), Math.max(0, start) + listRows) : <Text dimColor>(nenhuma tarefa)</Text>) : <Text dimColor>{`aguardando snapshot do engine${y.more}`}</Text>}
    </Pane>
  );
  const end = shownEvents.length - scroll;
  const eventsPane = (
    <Pane title={`Eventos ao vivo${scroll ? ` (rolado ${scroll})` : ''}`} focused={focus === 'events'} height={bodyRows} width={wide ? columns - leftWidth : columns}>
      {shownEvents.length
        ? shownEvents.slice(Math.max(0, end - listRows), end).map((e) => <Text key={e.seq} wrap="truncate-end">{formatEvent(e, ui.unicode)}</Text>)
        : <Text dimColor>(nenhum evento ainda)</Text>}
    </Pane>
  );

  let body: ReactElement;
  if (view === 'help') body = <HelpOverlay title="ases-tar" keys={KEYS} />;
  else if (view === 'detail' && detail) {
    const history = events.filter((e) => e.taskId === detail.id);
    body = (
      <Pane title={`${detail.id} ${y.dash} ${detail.title}`} focused height={bodyRows}>
        <Text wrap="truncate-end">{'estado '}<StateText state={detail.state} />{`${y.sep}versão ${detail.version}${y.sep}fase ${detail.phaseId}${y.sep}prioridade ${detail.priority}${y.sep}risco ${detail.risk}`}</Text>
        <Text wrap="truncate-end">{`requisitos ${detail.reqs.join(', ') || y.dash}${y.sep}depende de ${detail.dependsOn.join(', ') || y.dash}`}</Text>
        <Text wrap="truncate-end">progresso: indeterminado (sem milestones verificáveis, AER-REQ-098)</Text>
        <Text bold>{`Histórico (${history.length} evento(s) recebidos nesta sessão)`}</Text>
        {history.slice(-Math.max(1, listRows - 4)).map((e) => <Text key={e.seq} wrap="truncate-end">{formatEvent(e, ui.unicode)}</Text>)}
      </Pane>
    );
  } else body = wide ? <Box>{tasksPane}{eventsPane}</Box> : focus === 'tasks' ? tasksPane : eventsPane;

  const hints: [string, string][] = view === 'main'
    ? [['Tab', wide ? 'painel' : focus === 'tasks' ? 'ver eventos' : 'ver tarefas'], [y.updown, 'mover'], ['Enter', 'detalhe'], ['r', 'reler'], ['?', 'ajuda'], ['q', 'sair']]
    : [['Esc', 'voltar'], ['?', 'ajuda'], ['q', 'sair']];
  return (
    <Box flexDirection="column" width={columns}>
      {header}
      {body}
      <KeyHints hints={hints} />
    </Box>
  );
}

/** Liga o Monitor real à TUI e espera o usuário sair. */
export async function runTui(monitor: Monitor, ui: Ui, projectName: string, filter: { task?: string | undefined; phase?: string | undefined }, target: { h?: MonitorHandlers }): Promise<void> {
  const like: MonitorLike = {
    subscribe: (h) => {
      target.h = h;
      void monitor.run();
    },
    getTask: (id) => monitor.call<TaskRow | null>('task.get', { taskId: id }),
    reconnect: () => monitor.reconnect(),
    stop: () => monitor.stop(),
  };
  const instance = render(<UiContext.Provider value={ui}><TarApp monitor={like} projectName={projectName} filter={filter} /></UiContext.Provider>, { exitOnCtrlC: false });
  await instance.waitUntilExit();
}
