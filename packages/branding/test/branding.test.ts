import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LOGO_MODES, THEMES, pickLogoMode, renderBrand, stripAnsi, type ThemeName } from '../src/index.ts';

describe('Eureka42 brand (AER-REQ-240..248)', () => {
  it('tokens match branding/BRAND_TOKENS.json (single source, AER-REQ-248)', () => {
    const json = JSON.parse(readFileSync(new URL('../../../branding/BRAND_TOKENS.json', import.meta.url), 'utf8')) as { themes: unknown; glyph: string };
    expect(THEMES).toEqual(json.themes);
    expect(json.glyph).toBe('⌘');
  });

  it('golden text without color', () => {
    expect(renderBrand({ app: 'ASES CLI', mode: 'compact' })).toBe('⌘ Eureka42 | ASES CLI');
    expect(renderBrand({ app: 'ASES-TAR', mode: 'compact', status: 'LIVE' })).toBe('⌘ Eureka42 | ASES-TAR  [LIVE]');
    expect(renderBrand({ app: 'ASES CLI', mode: 'ascii' })).toBe('[E42] Eureka42 | ASES CLI');
    expect(renderBrand({ app: 'ASES CLI', mode: 'minimal' })).toBe('⌘ E42');
    expect(renderBrand({ app: 'ASES CLI', mode: 'full' })).toBe(
      '     ⌘   E U R E K A  42\n         ASES ENGINEERING RUNTIME\n         Local · Multi-Agent · ASES-300/500',
    );
  });

  it('no ANSI when color is off; same text once ANSI is stripped for every theme (AER-REQ-245)', () => {
    for (const mode of LOGO_MODES) {
      const plain = renderBrand({ app: 'ASES-TAR', mode });
      expect(plain).not.toMatch(/\u001b/);
      for (const theme of Object.keys(THEMES) as ThemeName[]) {
        expect(stripAnsi(renderBrand({ app: 'ASES-TAR', mode, theme, color: true }))).toBe(plain);
      }
    }
    expect(renderBrand({ app: 'ASES CLI', mode: 'compact', theme: 'teal', color: true })).toContain('\u001b[1m\u001b[38;2;0;150;136m⌘');
  });

  it.each([40, 50, 80, 120])('fits %i columns without wrapping (AER-REQ-244)', (columns) => {
    const mode = pickLogoMode({ columns, unicode: true });
    for (const line of renderBrand({ app: 'ASES-TAR', mode, status: 'RECONNECTING' }).split('\n')) {
      expect([...line].length).toBeLessThanOrEqual(columns);
    }
  });

  it('falls back to ASCII without Unicode even if a mode was requested (AER-REQ-241)', () => {
    expect(pickLogoMode({ columns: 120, unicode: false }, 'full')).toBe('ascii');
    expect(pickLogoMode({ columns: 120, unicode: true })).toBe('full');
    expect(pickLogoMode({ columns: 40, unicode: true })).toBe('minimal');
    expect(pickLogoMode({ columns: 0, unicode: true })).toBe('compact');
    expect(pickLogoMode({ columns: undefined, unicode: true })).toBe('compact');
  });
});
