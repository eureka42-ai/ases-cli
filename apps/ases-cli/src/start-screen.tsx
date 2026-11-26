import { existsSync, mkdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Box, Text, render, useInput } from 'ink';
import { useEffect, useState, type ReactElement } from 'react';
import { setPreferredCloudRemote, type SyncTarget } from '@aer/project-store';
import { CLOUD_BASE, CLOUD_PROVIDERS, PROJECTS_DIR_NAME, connectCloud, listRemoteProjects, pullProject, type CloudProviderId, type RemoteProject } from './sync.ts';
import { t } from './i18n.ts';
import { UiContext, useTerminalSize, useUi, type Ui } from '@aer/tui-shared';

// PHASE-19: ao abrir o `ases`, "Onde vamos trabalhar?". A pasta escolhida vira projeto sozinha (sem `ases init`).

const tilde = (p: string, home: string) => (p === home ? '~' : p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p);

/** Pasta onde "Novo projeto…" cria os projetos: ~/Projetos Eureka42 (o mesmo nome na nuvem) */
export const projectsDir = (home: string): string => path.join(home, PROJECTS_DIR_NAME);

/** Nome de projeto vira uma pasta: sem separadores, sem "." / "..", sem caracteres inválidos no Windows. Devolve o erro ou undefined. */
export function invalidProjectName(name: string): string | undefined {
  const n = name.trim();
  if (!n) return 'digite um nome';
  if (n.length > 80) return 'nome longo demais (máx. 80)';
  if (n === '.' || n === '..' || /[\\/<>:"|?*\u0000-\u001f]/.test(n)) return 'use só letras, números, espaço, - e _ (sem / \\ : * ? " < > |)';
  if (/[. ]$/.test(n)) return 'o nome não pode terminar com ponto ou espaço';
  return undefined;
}

type StartOption = { label: string; path?: string; create?: true; remote?: true; connect?: true };

/** O que a máquina tem para levar projetos a outra máquina (1.4.0). */
export interface SyncAvail { github: boolean; cloud?: string; cloudName?: string; rcloneInstalled?: boolean }

export function startOptions(o: { cwd: string; home: string; desktop: string; recent: string[]; sync?: SyncAvail }): StartOption[] {
  const out: StartOption[] = [];
  // a home não vira projeto; "esta pasta" só quando ela é outra
  if (path.resolve(o.cwd) !== path.resolve(o.home) && path.resolve(o.cwd) !== path.resolve(o.desktop)) out.push({ label: t('start.this', { p: tilde(o.cwd, o.home) }), path: o.cwd });
  out.push({ label: t('start.desktop', { p: tilde(o.desktop, o.home) }), path: o.desktop }, { label: t('start.new', { p: tilde(projectsDir(o.home), o.home) }), create: true });
  const from = [...(o.sync?.github ? ['GitHub'] : []), ...(o.sync?.cloud ? [o.sync.cloudName ?? o.sync.cloud] : [])];
  if (from.length) out.push({ label: t('start.remote', { from: from.join(' · ') }), remote: true });
  if (o.sync?.rcloneInstalled) out.push({ label: o.sync.cloud ? t('start.connectOther', { c: o.sync.cloudName ?? o.sync.cloud }) : t('start.connect'), connect: true });
  out.push({ label: t('start.choose') });
  for (const r of o.recent) if (path.resolve(r) !== path.resolve(o.cwd)) out.push({ label: t('start.recent', { p: tilde(r, o.home) }), path: r });
  return out;
}

/** Onde guardar o projeto novo: só as opções que funcionam nesta máquina. */
export function whereOptions(sync: SyncAvail | undefined): { label: string; targets: SyncTarget[] }[] {
  const out: { label: string; targets: SyncTarget[] }[] = [{ label: t('start.local'), targets: [] }];
  if (sync?.github) out.push({ label: t('start.github'), targets: ['github'] });
  if (sync?.cloud) out.push({ label: t('start.cloud', { c: `${sync.cloud}${CLOUD_BASE}` }), targets: ['cloud'] });
  if (sync?.github && sync.cloud) out.push({ label: t('start.both'), targets: ['github', 'cloud'] });
  return out;
}

type Mode = false | 'path' | 'name' | 'where' | 'remote' | 'connect';

export interface StartScreenProps {
  cwd: string; home: string; desktop: string; recent: string[];
  onChoose: (p: string, targets?: SyncTarget[]) => void;
  sync?: SyncAvail;
  /** injetáveis nos testes; padrão: rclone/gh de verdade */
  listRemote?: () => { projects: RemoteProject[]; errors: string[] };
  pull?: (p: RemoteProject) => string;
  connect?: (id: CloudProviderId) => Promise<{ remote: string; label: string }>;
}

export function StartScreen({ cwd, home, desktop, recent, onChoose, sync: syncProp, listRemote, pull, connect }: StartScreenProps): ReactElement {
  const ui = useUi();
  const { columns } = useTerminalSize();
  const [sync, setSync] = useState<SyncAvail | undefined>(syncProp);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const options = startOptions({ cwd, home, desktop, recent, ...(sync ? { sync } : {}) });
  const where = whereOptions(sync);
  const [sel, setSel] = useState(0);
  const [typing, setTyping] = useState<Mode>(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const [created, setCreated] = useState<string | undefined>(undefined);
  const [remote, setRemote] = useState<RemoteProject[] | undefined>(undefined);
  const [job, setJob] = useState<(() => void) | undefined>(undefined);

  // trabalho bloqueante (rclone/gh) roda depois de a mensagem "buscando…" aparecer na tela
  useEffect(() => {
    if (!job) return;
    const t = setTimeout(() => {
      setJob(undefined);
      job();
    }, 30);
    return () => clearTimeout(t);
  }, [job]);

  const back = () => {
    setTyped('');
    setError(undefined);
    setSel(0);
    setTyping(false);
  };

  useInput((ch, key) => {
    if (busy) return;
    if (typing === 'connect') {
      if (key.escape) return back();
      if (key.upArrow) return setSel((i) => Math.max(0, i - 1));
      if (key.downArrow) return setSel((i) => Math.min(CLOUD_PROVIDERS.length - 1, i + 1));
      if (!key.return) return;
      const c = CLOUD_PROVIDERS[sel]!;
      setBusy(t('start.opening', { c: c.label }));
      void (connect ?? connectCloud)(c.id).then((r) => {
        setPreferredCloudRemote(r.remote);
        setSync((s) => ({ github: s?.github ?? false, rcloneInstalled: true, cloud: r.remote, cloudName: r.label }));
        setNotice(t('start.connected', { c: r.label }));
      }, (err: Error) => setNotice(t('start.notConnected', { e: err.message }))).finally(() => {
        setBusy(undefined);
        back();
      });
      return;
    }
    if (typing === 'where' || typing === 'remote') {
      const n = typing === 'where' ? where.length : (remote?.length ?? 0);
      if (key.escape) return back();
      if (key.upArrow) return setSel((i) => Math.max(0, i - 1));
      if (key.downArrow) return setSel((i) => Math.min(Math.max(0, n - 1), i + 1));
      if (!key.return) return;
      if (typing === 'where') return onChoose(created!, where[sel]!.targets);
      const r = remote?.[sel];
      if (!r) return;
      setBusy(t('start.downloading', { n: r.name, s: r.source === 'cloud' ? t('cloud') : 'GitHub' }));
      return setJob(() => () => {
        try {
          onChoose((pull ?? ((x: RemoteProject) => pullProject(x, projectsDir(home))))(r));
        } catch (err) {
          setBusy(undefined);
          setError((err as Error).message);
        }
      });
    }
    if (typing) {
      if (key.return) {
        const raw = typed.trim();
        if (typing === 'name') {
          const bad = invalidProjectName(raw);
          if (bad) return setError(bad);
          const p = path.join(projectsDir(home), raw);
          if (existsSync(p) && !statSync(p).isDirectory()) return setError(`já existe um arquivo com esse nome: ${tilde(p, home)}`);
          try {
            mkdirSync(p, { recursive: true }); // já existente: só reabre o projeto
          } catch (err) {
            return setError(`não consegui criar ${tilde(p, home)}: ${(err as Error).message}`);
          }
          if (where.length < 2) return onChoose(p);
          setCreated(p);
          setSel(0);
          return setTyping('where');
        }
        const p = path.resolve(cwd, raw.startsWith('~') ? path.join(home, raw.slice(1)) : raw);
        if (!raw || !existsSync(p) || !statSync(p).isDirectory()) return setError(`pasta não encontrada: ${raw || '(vazio)'}`);
        return onChoose(p);
      }
      if (key.escape) return back();
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
      if (o.remote) {
        setBusy(t('start.searching'));
        return setJob(() => () => {
          const r = (listRemote ?? (() => listRemoteProjects(sync ?? { github: false })))();
          setBusy(undefined);
          setRemote(r.projects);
          setError(r.errors.length ? r.errors.join(' · ') : r.projects.length ? undefined : t('start.none'));
          setSel(0);
          setTyping('remote');
        });
      }
      if (o.connect) {
        setNotice(undefined);
        setSel(0);
        return setTyping('connect');
      }
      setTyping(o.create ? 'name' : 'path');
    }
  });

  const list = (items: string[]) => items.map((l, i) => <Text key={`${i}-${l}`} inverse={ui.color && i === sel}>{`  ${i === sel ? (ui.unicode ? '›' : '>') : ' '} ${l}`}</Text>);
  const red = (t: string) => <Text {...(ui.color ? { color: 'red' } : {})}>{`  ${t}`}</Text>;
  return (
    <Box flexDirection="column" width={columns}>
      {/* PHASE-20: só a pergunta; o logo grande aparece depois, já na pasta escolhida */}
      <Text bold>{`${ui.unicode ? '⌘' : '[E42]'} ${typing === 'where' ? t('start.whereKeep', { n: path.basename(created ?? '') }) : typing === 'remote' ? t('start.whichProject') : typing === 'connect' ? t('start.whichCloud') : t('start.where')}`}</Text>
      {sync && !typing && !busy ? <Text {...(ui.color ? { color: 'green' } : {})}>{`  ${ui.unicode ? '☁' : '*'} ${[sync.cloud ? t('start.status.cloud', { c: sync.cloudName ?? sync.cloud }) : t('start.status.nocloud'), t(sync.github ? 'start.status.github' : 'start.status.nogithub')].join(' · ')}`}</Text> : null}
      {notice && !busy ? <Text>{`  ${notice}`}</Text> : null}
      {busy ? <Text>{`  ${busy}`}</Text>
        : typing === 'connect' ? <Box flexDirection="column">{list(CLOUD_PROVIDERS.map((c) => c.label))}<Text dimColor={ui.color}>{t('start.connectHint')}</Text></Box>
        : typing === 'where' ? <Box flexDirection="column">{list(where.map((w) => w.label))}<Text dimColor={ui.color}>{t('start.whereHint')}</Text></Box>
        : typing === 'remote' ? <Box flexDirection="column">{list((remote ?? []).map((r) => `${r.name}  (${r.source === 'cloud' ? t('cloud') : `GitHub ${r.ref}`})`))}{error ? red(error) : null}<Text dimColor={ui.color}>{t('start.remoteHint', { p: tilde(projectsDir(home), home) })}</Text></Box>
        : typing ? (
        <Box flexDirection="column">
          <Text>{typing === 'name' ? t('start.typeName', { p: tilde(projectsDir(home), home) }) : t('start.typePath')}</Text>
          <Text>{`  > ${typed}${ui.unicode ? '█' : '_'}`}</Text>
          {error ? red(error) : null}
        </Box>
      ) : list(options.map((o) => o.label))}
      {!typing && !busy ? <Text dimColor={ui.color}>{t('start.footer')}</Text> : null}
    </Box>
  );
}

/** Mostra a tela e devolve a pasta escolhida (e, num projeto novo, onde guardá-lo). */
export async function runStartScreen(ui: Ui, o: { cwd: string; desktop: string; recent: string[]; sync?: SyncAvail }): Promise<{ path: string; targets?: SyncTarget[] } | undefined> {
  let chosen: { path: string; targets?: SyncTarget[] } | undefined;
  const instance = render(<UiContext.Provider value={ui}><StartScreen cwd={o.cwd} home={os.homedir()} desktop={o.desktop} recent={o.recent} {...(o.sync ? { sync: o.sync } : {})} onChoose={(p, targets) => { chosen = { path: p, ...(targets ? { targets } : {}) }; instance.unmount(); }} /></UiContext.Provider>, { exitOnCtrlC: true });
  await instance.waitUntilExit();
  return chosen;
}

/** Limpa a tela (e o histórico de rolagem) quando é um terminal de verdade; em pipe/arquivo não escreve nada. */
export function clearScreen(out: { isTTY?: boolean; write: (s: string) => boolean } = process.stdout): void {
  if (out.isTTY) out.write('\u001b[2J\u001b[3J\u001b[H');
}
