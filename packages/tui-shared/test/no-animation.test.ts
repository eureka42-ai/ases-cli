import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// AER-REQ-246: as TUIs não têm animação; um timer de desenho (spinner, setInterval) nas fontes de UI falha aqui.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const uiSources = ['apps/ases-cli/src', 'apps/ases-tar/src', 'packages/tui-shared/src', 'packages/branding/src']
  .flatMap((d) => readdirSync(path.join(repo, d)).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => path.join(d, f)));

describe('no animation in the TUIs (TAR-0074)', () => {
  it('UI sources have no setInterval, spinner or animation frame', () => {
    expect(uiSources.length).toBeGreaterThan(5);
    const hits = uiSources.filter((f) => /setInterval\(|ink-spinner|requestAnimationFrame|<Spinner/.test(readFileSync(path.join(repo, f), 'utf8')));
    expect(hits).toEqual([]);
  });
});
