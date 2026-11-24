// Marca textual Eureka42 (docs/BRANDING_EUREKA42.md, MD mestre §11.7). Cores PROPOSTAS, não oficiais (BRAND_TOKENS.json).
export const THEMES = {
  teal: { accent: '#009688', accent2: '#0B817A' },
  blue: { accent: '#184BC8', accent2: '#1040A4' },
  purple: { accent: '#8239B6', accent2: '#60259B' },
  gold: { accent: '#D79516', accent2: '#AC730D' },
  mono: { accent: null, accent2: null },
  contrast: { accent: null, accent2: null },
} as const;
export type ThemeName = keyof typeof THEMES;
/** `auto` não é paleta: escolhe pela profundidade de cor do terminal. */
export type ThemeChoice = ThemeName | 'auto';
export const THEME_CHOICES = [...(Object.keys(THEMES) as ThemeName[]), 'auto'] as const;

export function resolveTheme(choice: ThemeChoice, colorDepth: 0 | 4 | 8 | 24): ThemeName {
  if (choice !== 'auto') return choice;
  return colorDepth >= 8 ? 'teal' : colorDepth === 4 ? 'contrast' : 'mono';
}

export interface BrandPrefsLayer {
  source: string;
  theme?: unknown;
  logo?: unknown;
}

/**
 * Precedência de tema e logo (AER-REQ-249): a primeira camada que define o valor vence (CLI > projeto > global), senão
 * o padrão (`auto`, logo pela largura). Valor inválido numa camada é erro com a origem, nunca ignorado em silêncio.
 */
export function resolveBrandPrefs(layers: readonly BrandPrefsLayer[]): { theme: ThemeChoice; logo: LogoMode | undefined; themeSource: string; logoSource: string } {
  const pick = <T>(key: 'theme' | 'logo', valid: readonly string[]): { value: T | undefined; source: string } => {
    for (const l of layers) {
      const v = l[key];
      if (v === undefined || v === null) continue;
      if (typeof v !== 'string' || !valid.includes(v)) throw new Error(`invalid ${key} ${JSON.stringify(v)} in ${l.source} (use ${valid.join('|')})`);
      return { value: v as T, source: l.source };
    }
    return { value: undefined, source: 'default' };
  };
  const t = pick<ThemeChoice>('theme', THEME_CHOICES);
  const l = pick<LogoMode>('logo', LOGO_MODES);
  return { theme: t.value ?? 'auto', logo: l.value, themeSource: t.source, logoSource: l.source };
}
export const LOGO_MODES = ['full', 'compact', 'minimal', 'ascii'] as const;
export type LogoMode = (typeof LOGO_MODES)[number];
export type AppName = 'ASES CLI' | 'ASES-TAR';

export const GLYPH = '⌘';
export const GLYPH_FALLBACK = '[E42]';

export interface BrandOptions {
  app: AppName;
  mode: LogoMode;
  theme?: ThemeName;
  color?: boolean;
  status?: string;
  /** bits de cor do terminal (padrão 24); 8 e 4 aproximam a cor da paleta */
  colorDepth?: 0 | 4 | 8 | 24;
}

// paleta ANSI básica (xterm) para aproximar em terminais de 16 cores
const ANSI16: [number, number, number, number][] = [
  [30, 0, 0, 0], [31, 205, 0, 0], [32, 0, 205, 0], [33, 205, 205, 0], [34, 0, 0, 238], [35, 205, 0, 205], [36, 0, 205, 205], [37, 229, 229, 229],
  [90, 127, 127, 127], [91, 255, 0, 0], [92, 0, 255, 0], [93, 255, 255, 0], [94, 92, 92, 255], [95, 255, 0, 255], [96, 0, 255, 255], [97, 255, 255, 255],
];

/** Código SGR de primeiro plano para a cor, na profundidade dada. */
export function fgCode(hex: string, depth: 4 | 8 | 24): string {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  if (depth === 24) return `38;2;${r};${g};${b}`;
  if (depth === 8) {
    const q = (v: number) => Math.round((v / 255) * 5);
    return `38;5;${16 + 36 * q(r) + 6 * q(g) + q(b)}`;
  }
  // 16 cores: a mais próxima, ignorando preto/branco/cinzas para não apagar o acento
  const candidates = ANSI16.filter(([code]) => ![30, 37, 90, 97].includes(code));
  const best = candidates.reduce((a, c) => ((c[1] - r) ** 2 + (c[2] - g) ** 2 + (c[3] - b) ** 2 < (a[1] - r) ** 2 + (a[2] - g) ** 2 + (a[3] - b) ** 2 ? c : a));
  return String(best[0]);
}

const ESC = '\u001b[';
function paint(text: string, hex: string | null, enabled: boolean, bold = false, depth: 4 | 8 | 24 = 24, inverse = false): string {
  if (!enabled) return text;
  if (inverse) return `${ESC}1;7m${text}${ESC}0m`;
  const b = bold ? `${ESC}1m` : '';
  if (!hex) return bold ? `${b}${text}${ESC}0m` : text;
  return `${b}${ESC}${fgCode(hex, depth)}m${text}${ESC}0m`;
}

/** Escolhe o modo pela largura e pelo suporte a Unicode; pedido explícito vence, exceto glifo sem Unicode. */
export function pickLogoMode(caps: { columns: number | undefined; unicode: boolean }, requested?: LogoMode): LogoMode {
  if (!caps.unicode) return 'ascii';
  if (requested) return requested;
  const cols = caps.columns || 80; // 0 = pty que não informa largura → desconhecido
  return cols >= 100 ? 'full' : cols >= 50 ? 'compact' : 'minimal';
}

export function renderBrand(o: BrandOptions): string {
  const t = THEMES[o.theme ?? 'teal'];
  const c = o.color === true && o.colorDepth !== 0;
  const d = o.colorDepth || 24;
  const hc = o.theme === 'contrast';
  const g = paint(GLYPH, t.accent, c, true, d, hc);
  const n42 = paint('42', t.accent, c, true, d, hc);
  const status = o.status ? `  [${o.status}]` : '';
  switch (o.mode) {
    case 'full':
      return [
        `     ${g}   ${paint('E U R E K A', null, c, true)}  ${n42}`,
        `         ASES ENGINEERING RUNTIME${o.app === 'ASES-TAR' ? ' · ASES-TAR' : ''}${status}`,
        '         Local · Multi-Agent · ASES-300/500',
      ].join('\n');
    case 'compact':
      return `${g} Eureka${n42} | ${o.app}${status}`;
    case 'minimal':
      return `${g} E${n42}${status}`;
    case 'ascii':
      return `${GLYPH_FALLBACK} Eureka42 | ${o.app}${status}`;
  }
}

/** Remove sequências ANSI (testes e verificação de saída limpa). */
export const stripAnsi = (s: string): string => s.replace(/\u001b\[[0-9;]*m/g, '');
