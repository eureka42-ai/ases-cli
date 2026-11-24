// §12.2: saída de agente nunca vai para eventos/espelho com segredo em claro nem sem limite de tamanho.
const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/g, // chaves estilo OpenAI/Anthropic
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g, // tokens GitHub
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
];

/** Redige padrões conhecidos de segredo e corta em `max` caracteres. shortcut: lista fixa de padrões; ampliar com o scanner da PHASE-10. */
export function redactText(text: string, max = 4000): { text: string; redacted: boolean; truncated: boolean } {
  let redacted = false;
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, () => {
      redacted = true;
      return '[REDACTED]';
    });
  }
  const truncated = out.length > max;
  return { text: truncated ? `${out.slice(0, max)}…` : out, redacted, truncated };
}
