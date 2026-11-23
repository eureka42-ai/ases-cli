import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { KNOWN_SOURCES, gateG0, gateG1, nextRound, parseDiscoveryTracks, parseGeneralRequirements, sha256 } from '../src/index.ts';

const src = (f: string) => readFileSync(fileURLToPath(new URL(`../../../fontes/${f}`, import.meta.url)), 'utf8');
const ases300 = src(KNOWN_SOURCES.ASES300.file);
const specifier = src(KNOWN_SOURCES.ASES500_SPECIFIER.file);

describe('ASES-300 general requirements (TAR-0043, AER-REQ-151/152)', () => {
  it('the bundled sources still match the known SHA-256 (byte for byte)', () => {
    for (const k of Object.values(KNOWN_SOURCES)) expect(sha256(readFileSync(fileURLToPath(new URL(`../../../fontes/${k.file}`, import.meta.url))))).toBe(k.sha256);
  });

  it('parses exactly REQ-001..REQ-300, in order, literally (each block is a verbatim substring of the source)', () => {
    const reqs = parseGeneralRequirements(ases300);
    expect(reqs).toHaveLength(300);
    expect(reqs[0]).toMatchObject({ id: 'REQ-001', title: 'Nome oficial do sistema', classification: 'CORE', priority: 'HIGH', group: '24.3 IDENTIDADE, CONTEXTO E OBJETIVOS DO PRODUTO' });
    expect(reqs[299]).toMatchObject({ id: 'REQ-300', title: 'Release autorizada pelo Harness', priority: 'CRITICAL' });
    for (const r of reqs) {
      expect(ases300.includes(r.text)).toBe(true);
      expect(r.text.startsWith(`### ${r.id} — `)).toBe(true);
      expect(r.textSha256).toBe(sha256(r.text));
    }
    expect(reqs[299]!.text).not.toContain('Ao final do catálogo'); // o parágrafo seguinte não pertence ao REQ-300
    expect(Object.fromEntries(['CORE', 'CONDITIONAL', 'DOMAIN/CONDITIONAL'].map((c) => [c, reqs.filter((r) => r.classification === c).length]))).toEqual({ CORE: 229, CONDITIONAL: 61, 'DOMAIN/CONDITIONAL': 10 });
  });

  it('refuses a source with a missing or renumbered requirement instead of guessing', () => {
    expect(() => parseGeneralRequirements(ases300.replace('### REQ-150 — ', '### REQ-999 — '))).toThrow(/expected REQ-150/);
    expect(() => parseGeneralRequirements(ases300.replace(/### REQ-150 — [\s\S]*?(?=### REQ-151)/, ''))).toThrow(/299/);
  });
});

describe('ASES-500 interview (TAR-0044, AER-REQ-154/155)', () => {
  const qs = parseDiscoveryTracks(specifier);
  it('questions are the literal items of tracks A–J', () => {
    expect(new Set(qs.map((q) => q.track))).toEqual(new Set('ABCDEFGHIJ'.split('')));
    expect(qs[0]).toEqual({ id: 'A.1', track: 'A', trackTitle: 'Ideia e resultado esperado', text: 'Nome provisório' });
    for (const q of qs) expect(specifier.includes(q.text)).toBe(true);
  });

  it('a round has at most 6 gaps and never repeats an answered question or a track marked N/A', () => {
    expect(nextRound(qs, [])).toHaveLength(6);
    const r = nextRound(qs, [
      { id: 'DEC-0001', questionId: 'A.1', state: 'CONFIRMED' },
      { id: 'DEC-0002', questionId: 'A.2', state: 'PROPOSED' },
      { id: 'DEC-0003', questionId: 'A.3', state: 'OPEN' },
      { id: 'DEC-0004', questionId: 'B', state: 'N/A' },
    ], 20);
    expect(r.map((q) => q.id)).not.toContain('A.1');
    expect(r.map((q) => q.id)).not.toContain('A.2');
    expect(r.map((q) => q.id)[0]).toBe('A.3'); // OPEN é lacuna
    expect(r.some((q) => q.track === 'B')).toBe(false);
    expect(r).toHaveLength(6);
  });
});

describe('gates G0/G1 (TAR-0046)', () => {
  it('G0 needs the three known hashes and 300 general requirements', () => {
    const ok = gateG0({ sources: (Object.keys(KNOWN_SOURCES) as (keyof typeof KNOWN_SOURCES)[]).map((key) => ({ key, sha256: KNOWN_SOURCES[key].sha256 })), generalCount: 300 });
    expect(ok.pass).toBe(true);
    const bad = gateG0({ sources: [{ key: 'ASES300', sha256: 'x'.repeat(64) }], generalCount: 299 });
    expect(bad.pass).toBe(false);
    expect(bad.checks.filter((c) => !c.ok).map((c) => c.id)).toEqual(['source:ASES300', 'source:ASES500_SPECIFIER', 'source:ASES500_METHOD', 'general-requirements']);
  });

  it('G1 fails while anything is OPEN/PROPOSED/VALIDATION_REQUIRED or a domain requirement lacks approval/acceptance', () => {
    const decisions = [{ id: 'DEC-0001', questionId: 'A.1', state: 'CONFIRMED' as const }];
    expect(gateG1({ decisions, domain: [{ id: 'REQ-301', approved: true, acceptance: 'x' }] }).pass).toBe(true);
    expect(gateG1({ decisions: [...decisions, { id: 'DEC-0002', questionId: 'A.2', state: 'PROPOSED' }], domain: [{ id: 'REQ-301', approved: true, acceptance: 'x' }] }).pass).toBe(false);
    expect(gateG1({ decisions, domain: [{ id: 'REQ-301', approved: false, acceptance: 'x' }] }).checks.find((c) => c.id === 'domain-approved')?.ok).toBe(false);
    expect(gateG1({ decisions, domain: [] }).pass).toBe(false);
    // decisão substituída não conta como vigente
    expect(gateG1({ decisions: [{ id: 'DEC-0001', questionId: 'A.1', state: 'PROPOSED' }, { id: 'DEC-0002', questionId: 'A.1', state: 'CONFIRMED' }], domain: [{ id: 'REQ-301', approved: true, acceptance: 'x' }] }).pass).toBe(true);
  });
});
