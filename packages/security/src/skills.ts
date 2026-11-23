import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { sha256Hex } from '@aer/contracts';
import { skillCompatibility, type CompatMatrix } from './compat.ts';
import { scanDirectory, type ScanResult } from './scan.ts';

export interface SkillInfo {
  name: string;
  description: string;
  /** pasta da Skill (referência; o AER não copia nem altera o original, §9.2) */
  dir: string;
  scope: 'PROJECT' | 'USER';
  location: 'claude' | 'agents';
  manifestSha256: string;
  valid: boolean;
  problems: string[];
  compatibility: CompatMatrix;
  scan: ScanResult;
}

/**
 * Front matter YAML mínimo (`key: value` por linha) entre `---`. Qualquer outra construção é recusada: o AER não
 * interpreta YAML arbitrário (âncoras, tags, multilinha) vindo de terceiros (AER-REQ-132).
 */
export function parseFrontMatter(text: string): { ok: true; fields: Record<string, string> } | { ok: false; problem: string } {
  const norm = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  if (!norm.startsWith('---\n')) return { ok: false, problem: 'missing front matter (--- on the first line)' };
  const end = norm.indexOf('\n---', 4);
  if (end < 0) return { ok: false, problem: 'front matter not closed' };
  const fields: Record<string, string> = {};
  for (const line of norm.slice(4, end).split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const m = /^([A-Za-z][A-Za-z0-9_-]*):\s?(.*)$/.exec(line);
    if (!m) return { ok: false, problem: `unsupported front matter line: ${line.slice(0, 80)}` };
    let v = m[2]!.trim();
    if (/^[&*!|>]/.test(v)) return { ok: false, problem: `unsupported YAML construct in ${m[1]}` };
    if (/^".*"$|^'.*'$/.test(v)) v = v.slice(1, -1);
    fields[m[1]!] = v;
  }
  return { ok: true, fields };
}

/** Locais conhecidos de Skills (projeto e usuário). Só lê; nunca executa conteúdo (AER-REQ-131). */
export function skillRoots(projectRoot: string, home: string): { dir: string; scope: 'PROJECT' | 'USER'; location: 'claude' | 'agents' }[] {
  return [
    { dir: path.join(projectRoot, '.claude', 'skills'), scope: 'PROJECT', location: 'claude' },
    { dir: path.join(projectRoot, '.agents', 'skills'), scope: 'PROJECT', location: 'agents' },
    { dir: path.join(home, '.claude', 'skills'), scope: 'USER', location: 'claude' },
    { dir: path.join(home, '.agents', 'skills'), scope: 'USER', location: 'agents' },
  ];
}

export function discoverSkills(roots: ReturnType<typeof skillRoots>): SkillInfo[] {
  const out: SkillInfo[] = [];
  for (const r of roots) {
    if (!existsSync(r.dir)) continue;
    for (const name of readdirSync(r.dir).sort()) {
      const dir = path.join(r.dir, name);
      const manifest = path.join(dir, 'SKILL.md');
      if (!statSync(dir).isDirectory() || !existsSync(manifest)) continue;
      const text = readFileSync(manifest, 'utf8');
      const fm = parseFrontMatter(text);
      const problems = fm.ok ? [...(fm.fields.name ? [] : ['front matter without name']), ...(fm.fields.description ? [] : ['front matter without description'])] : [fm.problem];
      out.push({
        name: fm.ok && fm.fields.name ? fm.fields.name : name, description: fm.ok ? (fm.fields.description ?? '') : '', dir, scope: r.scope, location: r.location,
        manifestSha256: sha256Hex(text), valid: problems.length === 0, problems, compatibility: skillCompatibility(r.location), scan: scanDirectory(dir),
      });
    }
  }
  return out;
}
