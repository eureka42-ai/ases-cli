import { lstatSync, readFileSync, readdirSync, readlinkSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Inspeção de supply chain de uma extensão ANTES de instalar/ativar (§9.6, AER-REQ-139/168): scripts de instalação,
 * binários, symlinks que escapam, execução remota (`curl | sh`) e afins. Só lê arquivos; nunca executa nada.
 */
export type Severity = 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export interface Finding {
  code: string;
  severity: Severity;
  path: string;
  detail: string;
}
export type Verdict = 'SAFE' | 'REVIEW' | 'UNSAFE';
export interface ScanResult {
  verdict: Verdict;
  findings: Finding[];
  files: number;
}

const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'preprepare', 'postprepare'];
const TEXT_PATTERNS: { code: string; severity: Severity; re: RegExp; detail: string }[] = [
  { code: 'REMOTE_EXEC', severity: 'HIGH', re: /\b(curl|wget)\b[^\n|]{0,300}\|\s*(sudo\s+)?(ba|z|da|k)?sh\b/, detail: 'download piped into a shell' },
  { code: 'REMOTE_EXEC', severity: 'HIGH', re: /\bbase64\s+(-d|--decode)\b[^\n|]{0,200}\|\s*(ba|z)?sh\b/, detail: 'decoded payload piped into a shell' },
  { code: 'REMOTE_EXEC', severity: 'HIGH', re: /\b(iex|Invoke-Expression)\b[^\n]{0,200}(DownloadString|Invoke-WebRequest|iwr)\b/i, detail: 'PowerShell download-and-execute' },
  { code: 'OBFUSCATED_EVAL', severity: 'HIGH', re: /\beval\s*\(\s*(atob|Buffer\.from)\s*\(/, detail: 'eval of decoded data' },
  { code: 'DESTRUCTIVE', severity: 'HIGH', re: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+(--no-preserve-root\s+)?(\/|~|\$HOME)(\s|$|\/\*)/, detail: 'recursive delete of / or home' },
  { code: 'CREDENTIAL_ACCESS', severity: 'HIGH', re: /(\.ssh\/id_[a-z0-9]+|\.aws\/credentials|\.claude\/\.credentials|\.codex\/auth\.json|Library\/Keychains)/, detail: 'reads credential files of the user or of other tools' },
];
const MAGIC: [string, Buffer][] = [
  ['ELF', Buffer.from([0x7f, 0x45, 0x4c, 0x46])], ['Mach-O', Buffer.from([0xcf, 0xfa, 0xed, 0xfe])], ['Mach-O', Buffer.from([0xce, 0xfa, 0xed, 0xfe])],
  ['Mach-O fat', Buffer.from([0xca, 0xfe, 0xba, 0xbe])], ['PE', Buffer.from([0x4d, 0x5a])],
];

export function verdictOf(findings: readonly Finding[]): Verdict {
  if (findings.some((f) => f.severity === 'HIGH')) return 'UNSAFE';
  if (findings.some((f) => f.severity === 'MEDIUM')) return 'REVIEW';
  return 'SAFE';
}

export function scanDirectory(root: string, o: { maxFiles?: number; maxBytesPerFile?: number } = {}): ScanResult {
  const maxFiles = o.maxFiles ?? 5000;
  const maxBytes = o.maxBytesPerFile ?? 1024 * 1024;
  const findings: Finding[] = [];
  const base = path.resolve(root);
  let files = 0;
  const rel = (p: string) => path.relative(base, p).split(path.sep).join('/') || '.';
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      findings.push({ code: 'UNREADABLE', severity: 'MEDIUM', path: rel(dir), detail: 'directory could not be read' });
      return;
    }
    for (const name of entries.sort()) {
      if (files >= maxFiles) return;
      const full = path.join(dir, name);
      const st = lstatSync(full);
      if (st.isSymbolicLink()) {
        const target = path.resolve(dir, readlinkSync(full));
        const inside = target === base || target.startsWith(base + path.sep);
        if (!inside) findings.push({ code: 'SYMLINK_ESCAPE', severity: 'HIGH', path: rel(full), detail: `symlink points outside the extension: ${target}` });
        continue; // nunca segue symlink
      }
      if (st.isDirectory()) {
        if (name === '.git') continue;
        walk(full);
        continue;
      }
      if (!st.isFile()) continue;
      files++;
      if (process.platform !== 'win32' && (st.mode & 0o111) !== 0) findings.push({ code: 'EXECUTABLE', severity: 'LOW', path: rel(full), detail: 'executable file' });
      if (st.size > maxBytes) {
        findings.push({ code: 'LARGE_FILE', severity: 'MEDIUM', path: rel(full), detail: `${st.size} bytes, not scanned` });
        continue;
      }
      const buf = readFileSync(full);
      const magic = MAGIC.find(([, m]) => buf.subarray(0, m.length).equals(m));
      if (magic && !(magic[0] === 'PE' && buf.length < 64)) {
        findings.push({ code: 'BINARY', severity: 'MEDIUM', path: rel(full), detail: `${magic[0]} binary` });
        continue;
      }
      const text = buf.toString('utf8');
      if (name === 'package.json') {
        try {
          const scripts = (JSON.parse(text) as { scripts?: Record<string, string> }).scripts ?? {};
          for (const s of INSTALL_SCRIPTS) if (scripts[s]) findings.push({ code: 'INSTALL_SCRIPT', severity: 'HIGH', path: rel(full), detail: `${s}: ${scripts[s].slice(0, 200)}` });
        } catch {
          findings.push({ code: 'INVALID_MANIFEST', severity: 'MEDIUM', path: rel(full), detail: 'package.json is not valid JSON' });
        }
      }
      for (const p of TEXT_PATTERNS) if (p.re.test(text)) findings.push({ code: p.code, severity: p.severity, path: rel(full), detail: p.detail });
    }
  };
  try {
    if (!statSync(base).isDirectory()) throw new Error('not a directory');
  } catch {
    return { verdict: 'UNSAFE', findings: [{ code: 'NOT_FOUND', severity: 'HIGH', path: '.', detail: `${root} is not a readable directory` }], files: 0 };
  }
  walk(base);
  if (files >= maxFiles) findings.push({ code: 'SCAN_TRUNCATED', severity: 'MEDIUM', path: '.', detail: `stopped after ${maxFiles} files` });
  return { verdict: verdictOf(findings), findings, files };
}
