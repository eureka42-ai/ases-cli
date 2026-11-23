// AER-REQ-021/031 e §4.2: PHASE-01..99 (depois PHASE-100), TAR-0001..9999 (depois TAR-10000), ATT-0001.
const PHASE_RE = /^PHASE-(\d{2,})$/;
const TASK_RE = /^TAR-(\d{4,})$/;
const ATTEMPT_RE = /^ATT-(\d{4,})$/;

function format(prefix: string, width: number, n: number): string {
  if (!Number.isSafeInteger(n) || n < 1) throw new RangeError(`${prefix} sequence must be a positive integer, got ${n}`);
  return `${prefix}-${String(n).padStart(width, '0')}`;
}

function parse(re: RegExp, width: number, id: string): number {
  const digits = re.exec(id)?.[1];
  // rejeita zeros à esquerda além da largura mínima (ex.: PHASE-001), mantendo um formato canônico por número
  if (digits === undefined || (digits.length > width && digits.startsWith('0'))) throw new TypeError(`invalid id: ${id}`);
  const n = Number(digits);
  if (n < 1) throw new TypeError(`invalid id: ${id}`);
  return n;
}

export const formatPhaseId = (n: number): string => format('PHASE', 2, n);
export const formatTaskId = (n: number): string => format('TAR', 4, n);
export const formatAttemptId = (n: number): string => format('ATT', 4, n);
export const parsePhaseId = (id: string): number => parse(PHASE_RE, 2, id);
export const parseTaskId = (id: string): number => parse(TASK_RE, 4, id);
export const parseAttemptId = (id: string): number => parse(ATTEMPT_RE, 4, id);
