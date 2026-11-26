import { Box, Text, useInput } from 'ink';
import { useState, type ReactElement } from 'react';
import { useUi } from '@aer/tui-shared';
import type { ModelList } from './models.ts';
import { t } from './i18n.ts';

// PHASE-20: /modelo — ← → escolhe a IA, ↑ ↓ o modelo, Espaço seleciona, Esc fecha.
export function ModelPicker({ lists, current, onChoose, onClose, onType }: { lists: ModelList[]; current: Record<string, string>; onChoose: (provider: string, model: string | null) => void; onClose: () => void; onType?: (provider: string) => void }): ReactElement {
  const ui = useUi();
  const [col, setCol] = useState(0);
  const [sel, setSel] = useState(0);
  const list = lists[col]!;
  const rows = [{ id: null as string | null, label: t('picker.default') }, ...list.models.map((m) => ({ id: m.id as string | null, label: m.name === m.id ? m.id : `${m.id}  ${m.name}` })), ...(list.canSet ? [{ id: '__type__', label: t('picker.type') }] : [])];
  const visible = 14;
  const start = Math.max(0, Math.min(sel - Math.floor(visible / 2), rows.length - visible));

  useInput((ch, key) => {
    if (key.escape) return onClose();
    if (key.leftArrow || key.rightArrow) {
      setCol((c) => (c + (key.rightArrow ? 1 : lists.length - 1)) % lists.length);
      setSel(0);
      return;
    }
    if (key.upArrow) return setSel((i) => Math.max(0, i - 1));
    if (key.downArrow) return setSel((i) => Math.min(rows.length - 1, i + 1));
    if (ch === ' ' || key.return) {
      if (!list.canSet) return;
      const r = rows[sel]!;
      if (r.id === '__type__') return onType?.(list.provider);
      onChoose(list.provider, r.id);
    }
  });

  const mark = (id: string | null) => (id === null ? !current[list.provider] : current[list.provider] === id);
  return (
    <Box flexDirection="column" borderStyle={ui.unicode ? 'round' : 'classic'} paddingX={1}>
      <Text bold>{t('picker.title')}</Text>
      {/* IA não instalada: aparece, mas em cinza (a lista vale para quando ela for instalada) */}
      <Text>{lists.map((l, i) => <Text key={l.provider} dimColor={ui.color && l.installed === false}>{`${i ? ' ' : ''}${i === col ? `[ ${l.provider} ]` : `  ${l.provider}  `}`}</Text>)}</Text>
      <Text dimColor={ui.color}>{list.installed === false ? t('picker.notInstalled', { p: list.provider }) : `${t('picker.list')}: ${list.source}${list.note ? ` · ${list.note}` : ''}`}</Text>
      {rows.slice(start, start + visible).map((r, k) => {
        const i = start + k;
        return <Text key={`${list.provider}-${i}`} inverse={ui.color && i === sel} dimColor={ui.color && list.installed === false && i !== sel} wrap="truncate-end">{`${i === sel ? (ui.unicode ? '›' : '>') : ' '} ${mark(r.id) ? (ui.unicode ? '●' : '*') : ' '} ${r.label}${list.installed === false && r.id && r.id !== '__type__' ? `  ${t('picker.notInstalledTag')}` : ''}`}</Text>;
      })}
    </Box>
  );
}
