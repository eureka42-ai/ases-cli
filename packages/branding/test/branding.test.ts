import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LOGO_MODES, SITE, THEMES, aboutText, fgCode, pickLogoMode, renderBanner, renderBrand, resolveBrandPrefs, resolveTheme, stripAnsi, type ThemeName } from '../src/index.ts';

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
    expect(pickLogoMode({ columns: 120, unicode: true })).toBe('banner');
    expect(pickLogoMode({ columns: 40, unicode: true })).toBe('minimal');
    expect(pickLogoMode({ columns: 0, unicode: true })).toBe('compact');
    expect(pickLogoMode({ columns: undefined, unicode: true })).toBe('compact');
  });
});

// WCAG 2.x: luminância relativa e razão de contraste
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

describe('color depth, contrast and preferences (PHASE-16, TAR-0071..0073)', () => {
  it('approximates the palette to 256 and 16 colors; no truecolor escape below 24 bits (AER-REQ-243)', () => {
    expect(fgCode('#009688', 24)).toBe('38;2;0;150;136');
    expect(fgCode('#009688', 8)).toBe('38;5;37'); // cubo 6x6x6: 16 + 36·0 + 6·3 + 3
    expect(fgCode('#009688', 4)).toBe('36');
    for (const theme of ['teal', 'blue', 'purple', 'gold'] as const) {
      for (const depth of [4, 8] as const) expect(renderBrand({ app: 'ASES CLI', mode: 'compact', theme, color: true, colorDepth: depth })).not.toMatch(/38;2;/);
    }
    expect(renderBrand({ app: 'ASES CLI', mode: 'compact', theme: 'teal', color: true, colorDepth: 0 })).toBe(stripAnsi(renderBrand({ app: 'ASES CLI', mode: 'compact' })));
  });

  it('every color theme reaches 3:1 on a dark or a light background; contrast uses terminal fg bold+inverse', () => {
    const table = (['teal', 'blue', 'purple', 'gold'] as const).map((t) => ({ t, dark: ratio(THEMES[t].accent, '#000000'), light: ratio(THEMES[t].accent, '#FFFFFF') }));
    for (const r of table) expect(Math.max(r.dark, r.light)).toBeGreaterThanOrEqual(3);
    // medido e registrado em docs/BRANDING_EUREKA42.md: só o blue fica abaixo de 3:1 em fundo preto
    expect(table.filter((r) => r.dark < 3).map((r) => r.t)).toEqual(['blue']);
    expect(renderBrand({ app: 'ASES CLI', mode: 'compact', theme: 'contrast', color: true })).toContain('\u001b[1;7m⌘');
  });

  it('auto picks by color depth; precedence CLI > project > global > default, invalid value names its source (AER-REQ-249)', () => {
    expect([24, 8, 4, 0].map((d) => resolveTheme('auto', d as 0 | 4 | 8 | 24))).toEqual(['green', 'green', 'contrast', 'mono']);
    expect(resolveTheme('gold', 4)).toBe('gold');
    const p = resolveBrandPrefs([{ source: 'cli' }, { source: 'project', theme: 'purple' }, { source: 'global', theme: 'gold', logo: 'minimal' }]);
    expect(p).toEqual({ theme: 'purple', logo: 'minimal', themeSource: 'project', logoSource: 'global' });
    expect(resolveBrandPrefs([{ source: 'cli', theme: 'blue' }, { source: 'project', theme: 'purple' }]).theme).toBe('blue');
    expect(resolveBrandPrefs([{ source: 'cli' }])).toEqual({ theme: 'auto', logo: undefined, themeSource: 'default', logoSource: 'default' });
    expect(() => resolveBrandPrefs([{ source: '.ases/CONFIG.json', theme: 'pink' }])).toThrow(/invalid theme "pink" in \.ases\/CONFIG\.json/);
  });
});

describe('PHASE-18: green banner, about, site (TAR-0078)', () => {
  it('banner: 6 block rows + status line, green, ≤ 72 cols', () => {
    const b = renderBanner({ color: true, colorDepth: 24, unicode: true, main: 'claude', ready: 5 }).split('\n');
    expect(b).toHaveLength(7);
    expect(Math.max(...b.slice(0, 6).map((l) => [...stripAnsi(l)].length))).toBeLessThanOrEqual(72); // a linha de status é cortada pela TUI
    expect(b[0]).toContain('\u001b[38;2;34;197;94m');
    expect(stripAnsi(b[6]!)).toBe('⌘  ASES Engineering Runtime · eureka42.org · principal: claude · 5 IAs prontas');
  });
  it('banner without unicode uses only ASCII', () => {
    expect(renderBanner({ color: false, unicode: false })).toMatch(/^[\x20-\x7e\n]+$/);
  });
  it('banner respects depth and NO_COLOR', () => {
    expect(renderBanner({ color: true, colorDepth: 4, unicode: true })).not.toMatch(/38;2;/);
    expect(renderBanner({ color: false, unicode: true })).not.toMatch(/\u001b\[/);
  });
  it('pickLogoMode chooses banner at ≥72 cols', () => {
    expect(pickLogoMode({ columns: 72, unicode: true })).toBe('banner');
    expect(pickLogoMode({ columns: 71, unicode: true })).toBe('compact');
  });
  it('green contrast is measured (≥3:1 on black)', () => {
    expect(THEMES.green.accent).toBe('#22C55E');
    expect(ratio('#22C55E', '#000000')).toBeGreaterThan(9);
    expect(ratio('#22C55E', '#FFFFFF')).toBeLessThan(2.5);
  });
  it('auto resolves to green at 24/8 bits', () => {
    expect(resolveTheme('auto', 24)).toBe('green');
    expect(resolveTheme('auto', 8)).toBe('green');
  });
  it('about text is the literal approved by the owner', () => {
    expect(SITE).toBe('eureka42.org');
    expect(aboutText('1.1.0')).toBe('⌘ Eureka42 · ASES Engineering Runtime (AER) 1.1.0\nO Eureka42 é uma iniciativa dos Professores Raul el Greco, Giuseppe Favato e Elzo Brito.\neureka42.org · Licença CC BY-NC-ND 4.0');
  });
});
