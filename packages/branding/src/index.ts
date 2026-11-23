// Marca textual Eureka42 (docs/BRANDING_EUREKA42.md, MD mestre §11.7). Cores PROPOSTAS, não oficiais (BRAND_TOKENS.json).
export const THEMES = {
  teal: { accent: '#009688', accent2: '#0B817A' },
  blue: { accent: '#184BC8', accent2: '#1040A4' },
  purple: { accent: '#8239B6', accent2: '#60259B' },
  gold: { accent: '#D79516', accent2: '#AC730D' },
  mono: { accent: null, accent2: null },
} as const;
export type ThemeName = keyof typeof THEMES;
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
}

const ESC = '\u001b[';
function paint(text: string, hex: string | null, enabled: boolean, bold = false): string {
  if (!enabled) return text;
  const b = bold ? `${ESC}1m` : '';
  if (!hex) return bold ? `${b}${text}${ESC}0m` : text;
  const [r, g, bl] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  // shortcut: só truecolor; terminais sem 24 bits aproximam sozinhos. Mapear para 256/16 cores na PHASE-16.
  return `${b}${ESC}38;2;${r};${g};${bl}m${text}${ESC}0m`;
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
  const c = o.color === true;
  const g = paint(GLYPH, t.accent, c, true);
  const n42 = paint('42', t.accent, c, true);
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
