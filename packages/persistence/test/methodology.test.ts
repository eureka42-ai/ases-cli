import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { KNOWN_SOURCES, parseGeneralRequirements } from '@aer/ases-methodology';
import { openStore, tempDir } from './helpers.ts';

const general = parseGeneralRequirements(readFileSync(fileURLToPath(new URL(`../../../fontes/${KNOWN_SOURCES.ASES300.file}`, import.meta.url)), 'utf8'));
const dir = tempDir();
const fresh = (name: string) => {
  const s = openStore(path.join(dir, `${name}.sqlite`));
  s.importMethodologySource('ASES300', '.ases/sources/ASES-300.md', KNOWN_SOURCES.ASES300.sha256, general);
  return s;
};
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code: string }).code;
  }
  return 'NO_ERROR';
};

describe('requirements matrix in the store (TAR-0045)', () => {
  it('imports 300 literal general requirements once; re-import is a no-op; different text is refused', () => {
    const s = fresh('import');
    expect(s.listRequirements('GENERAL')).toHaveLength(300);
    expect(s.getRequirement('REQ-116')).toMatchObject({ classification: 'DOMAIN/CONDITIONAL', status: 'PENDING', series: 'GENERAL' });
    expect(s.getRequirement('REQ-001')!.text).toBe(general[0]!.text);
    expect(s.importMethodologySource('ASES300', 'x', KNOWN_SOURCES.ASES300.sha256, general)).toEqual({ inserted: 0 });
    const tampered = general.map((r) => (r.id === 'REQ-010' ? { ...r, text: `${r.text} (editado)`, textSha256: 'f'.repeat(64) } : r));
    expect(code(() => s.importMethodologySource('ASES300', 'x', KNOWN_SOURCES.ASES300.sha256, tampered))).toBe('SOURCE_CONFLICT');
    expect(s.getRequirement('REQ-010')!.text).toBe(general[9]!.text);
  });

  it('PASS needs evidence; N/A/FAIL/BLOCKED need a justification; CORE N/A needs an explicit approver (AER-REQ-158)', () => {
    const s = fresh('status');
    expect(code(() => s.setRequirementStatus('REQ-001', 'PASS'))).toBe('EVIDENCE_REQUIRED');
    expect(code(() => s.setRequirementStatus('REQ-116', 'N/A'))).toBe('JUSTIFICATION_REQUIRED');
    expect(code(() => s.setRequirementStatus('REQ-001', 'N/A', { note: 'não se aplica' }))).toBe('APPROVAL_REQUIRED'); // REQ-001 é CORE
    s.setRequirementStatus('REQ-116', 'N/A', { note: 'CLI sem listagem CRUD' }); // DOMAIN/CONDITIONAL: só justificativa
    s.setRequirementStatus('REQ-001', 'PASS', { evidence: { path: 'docs/PRODUCT.md', sha256: 'a'.repeat(64) } });
    expect(s.getRequirement('REQ-001')).toMatchObject({ status: 'PASS', evidencePath: 'docs/PRODUCT.md' });
    expect(s.getRequirement('REQ-116')).toMatchObject({ status: 'N/A', note: 'CLI sem listagem CRUD' });
    expect(code(() => s.setRequirementStatus('REQ-999', 'PENDING'))).toBe('NOT_FOUND');
    expect(code(() => s.setRequirementStatus('REQ-002', 'DONE'))).toBe('INVALID_INPUT');
  });

  it('domain requirements start at REQ-301, need acceptance and origin; after approval, content changes need a CHANGE that cites them (AER-REQ-159)', () => {
    const s = fresh('domain');
    expect(code(() => s.createDomainRequirement({ title: 'x', acceptance: '', priority: 'HIGH', origin: 'DEC-0001' }))).toBe('INVALID_INPUT');
    const a = s.createDomainRequirement({ title: 'Exportar relatório', acceptance: 'Dado X, quando Y, então Z', priority: 'HIGH', origin: 'DEC-0001', dependencies: ['REQ-097'] });
    const b = s.createDomainRequirement({ title: 'Login', acceptance: 'login com MFA', priority: 'CRITICAL', origin: 'DEC-0002' });
    expect([a, b]).toEqual(['REQ-301', 'REQ-302']);
    s.editDomainRequirement(a, { acceptance: 'Dado X, quando Y, então Z em < 2 s' }); // antes da aprovação: livre
    s.approveRequirement(a, 'responsável');
    expect(code(() => s.editDomainRequirement(a, { title: 'outro' }))).toBe('CHANGE_REQUIRED');
    const wrong = s.createChange({ reason: 'outra coisa', targets: [b], approvedBy: 'responsável' });
    expect(code(() => s.editDomainRequirement(a, { title: 'outro' }, wrong))).toBe('CHANGE_REQUIRED');
    const ch = s.createChange({ reason: 'cliente pediu PDF', targets: [a], approvedBy: 'responsável' });
    s.editDomainRequirement(a, { title: 'Exportar relatório em PDF' }, ch);
    expect(s.getRequirement(a)).toMatchObject({ title: 'Exportar relatório em PDF', approvedBy: 'responsável' });
    expect(code(() => s.editDomainRequirement('REQ-001', { title: 'x' }))).toBe('INVALID_INPUT'); // geral nunca é reescrito
    expect(code(() => s.approveRequirement('REQ-001', 'r'))).toBe('INVALID_INPUT');
  });

  it('decisions: newer supersedes older; replacing a CONFIRMED one needs a CHANGE (§13.6)', () => {
    const s = fresh('decisions');
    const d1 = s.recordDecision({ questionId: 'A.1', question: 'Nome provisório', answer: 'Agenda+', state: 'PROPOSED' });
    const d2 = s.recordDecision({ questionId: 'A.1', question: 'Nome provisório', answer: 'Agenda+', state: 'CONFIRMED' }); // confirmar proposta: livre
    expect(s.listDecisions().map((d) => [d.id, d.state])).toEqual([[d1, 'SUPERSEDED'], [d2, 'CONFIRMED']]);
    expect(code(() => s.recordDecision({ questionId: 'A.1', question: 'Nome provisório', answer: 'Outro', state: 'CONFIRMED' }))).toBe('CHANGE_REQUIRED');
    const ch = s.createChange({ reason: 'renomear', targets: ['A.1'], approvedBy: 'responsável' });
    s.recordDecision({ questionId: 'A.1', question: 'Nome provisório', answer: 'Outro', state: 'CONFIRMED', changeId: ch });
    expect(s.listDecisions().filter((d) => d.state !== 'SUPERSEDED').map((d) => d.answer)).toEqual(['Outro']);
    expect(code(() => s.recordDecision({ questionId: 'B', question: 'Usuários e permissões', answer: '', state: 'N/A' }))).toBe('INVALID_INPUT');
    expect(code(() => s.recordDecision({ questionId: 'B', question: 'x', answer: 'y', state: 'SUPERSEDED' }))).toBe('INVALID_INPUT');
  });

  it('with the matrix active, every task must cite existing requirements (AER-REQ-157)', () => {
    const s = fresh('tasks');
    const ph = s.createPhase('P');
    expect(code(() => s.createTask({ phaseId: ph, title: 't' }))).toBe('REQUIREMENT_REQUIRED');
    expect(code(() => s.createTask({ phaseId: ph, title: 't', reqs: ['REQ-777'] }))).toBe('NOT_FOUND');
    expect(s.createTask({ phaseId: ph, title: 't', reqs: ['REQ-001'] })).toMatch(/^TAR-/);
    // projeto sem matriz: comportamento anterior preservado
    const plain = openStore(path.join(dir, 'plain.sqlite'));
    expect(plain.createTask({ phaseId: plain.createPhase('P'), title: 't' })).toMatch(/^TAR-/);
  });

  it('every change is an event (traceable history)', () => {
    const s = fresh('events');
    s.setRequirementStatus('REQ-116', 'N/A', { note: 'n/a' });
    const types = s.eventsSince(0, 1000).map((e) => e.eventType);
    expect(types).toContain('MethodologySourceImported');
    expect(types).toContain('RequirementUpdated');
  });
});
