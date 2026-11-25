import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// AER-REQ-246: animação só opcional. O único timer de desenho permitido é o relógio de "pensando" do ases
// (apps/ases-cli/src/ticker.ts), que respeita --no-animation, CI, TERM=dumb e ASES_REDUCED_MOTION.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const uiSources = ['apps/ases-cli/src', 'apps/ases-tar/src', 'packages/tui-shared/src', 'packages/branding/src']
  .flatMap((d) => readdirSync(path.join(repo, d)).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => path.join(d, f)));

describe('no animation in the TUIs (TAR-0074)', () => {
  it('UI sources have no setInterval, spinner or animation frame outside the guarded ticker', () => {
    expect(uiSources.length).toBeGreaterThan(5);
    const hits = uiSources.filter((f) => /setInterval\(|ink-spinner|requestAnimationFrame|<Spinner/.test(readFileSync(path.join(repo, f), 'utf8')));
    expect(hits).toEqual(['apps/ases-cli/src/ticker.ts']);
    const ticker = readFileSync(path.join(repo, 'apps/ases-cli/src/ticker.ts'), 'utf8');
    expect(ticker).toMatch(/if \(!active \|\| !animation\) return/);
  });

  it('the ticker is off with --no-animation, CI, TERM=dumb and reduced motion', async () => {
    const { shouldAnimate } = await import('../../../apps/ases-cli/src/ticker.ts');
    expect(shouldAnimate({}, { TERM: 'xterm-256color' })).toBe(true);
    expect(shouldAnimate({ noAnimation: true }, {})).toBe(false);
    expect(shouldAnimate({ ci: true }, {})).toBe(false);
    expect(shouldAnimate({}, { TERM: 'dumb' })).toBe(false);
    expect(shouldAnimate({}, { ASES_REDUCED_MOTION: '1' })).toBe(false);
    expect(shouldAnimate({}, { CI: 'true' })).toBe(false);
  });
});
