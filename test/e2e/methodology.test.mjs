import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { BIN, requireBuild, runSync, tempProject } from './helpers.mjs';

requireBuild();
const p = tempProject('e2e ases ç');
afterAll(() => p.cleanup());
const session = (lines) => {
  const r = spawnSync(process.execPath, [BIN.ases, '--no-tui'], { cwd: p.dir, encoding: 'utf8', input: [...lines, '/exit', ''].join('\n'), timeout: 60_000, env: { ...process.env, NO_COLOR: '1' } });
  expect(r.status).toBe(0);
  return r.stdout;
};

describe('PHASE-09 gate: interview → approved requirements → 2 phases and 3 traceable tasks (TAR-0047)', () => {
  it('runs the whole ASES-300/500 flow in an example project', () => {
    expect(runSync(BIN.ases, ['init', '--name', 'exemplo'], p.dir).status).toBe(0);

    // G0: fontes conhecidas importadas byte a byte e 300 REQ gerais literais
    let out = session(['/gate G0', '/ases import', '/gate G0', '/reqs']);
    expect(out).toMatch(/G0: FAIL/);
    expect(out).toMatch(/ASES300: \.ases\/sources\/ASES-300_DOCUMENTACAO_INTEGRAL\.md .* 300 REQ gerais novos \(300\/300 na matriz\)/);
    expect(out).toMatch(/PARA VALIDAÇÃO/);
    expect(out).toMatch(/G0: PASS/);
    expect(out).toMatch(/300 requisito\(s\): PENDING 300/);
    expect(readFileSync(path.join(p.dir, '.ases/sources/ASES-300_DOCUMENTACAO_INTEGRAL.md'))).toEqual(readFileSync(path.resolve('fontes/ASES-300_DOCUMENTACAO_INTEGRAL.md')));

    // entrevista: só lacunas; resposta registrada não volta na rodada seguinte
    out = session(['/spec', '/spec answer A.1 Agenda Clínica', '/spec propose A.2 Remarcação manual por telefone gera faltas', '/spec na G Sem IA nesta versão', '/spec']);
    const rounds = out.split('Perguntas desta rodada');
    expect(rounds).toHaveLength(3);
    expect(rounds[1]).toMatch(/A\.1 \[A\. Ideia e resultado esperado\] Nome provisório/);
    expect(rounds[2]).not.toMatch(/ A\.1 /);
    expect(rounds[2]).not.toMatch(/ A\.2 /);
    expect(rounds[2]).toMatch(/ A\.3 /);

    // G1 falha com PROPOSED pendente e sem requisitos de domínio aprovados
    out = session(['/gate G1']);
    expect(out).toMatch(/G1: FAIL/);
    expect(out).toMatch(/PROPOSED: A\.2/);

    out = session([
      '/spec answer A.2 Remarcação manual por telefone gera faltas',
      '/req add HIGH DEC-0001 Agendar consulta :: Dado um horário livre, quando o paciente confirma, então a consulta aparece na agenda do médico',
      '/req add HIGH DEC-0003 Cancelar consulta :: Cancelamento até 24 h antes libera o horário em até 1 minuto',
      '/req add MEDIUM DEC-0003 Lembrete por e-mail :: E-mail enviado 24 h antes de cada consulta --deps REQ-301',
      '/req approve REQ-301 responsável', '/req approve REQ-302 responsável', '/req approve REQ-303 responsável',
      '/gate G1',
    ]);
    expect(out).toMatch(/criado REQ-301[\s\S]*criado REQ-302[\s\S]*criado REQ-303/);
    expect(out).toMatch(/G1: PASS/);

    // mudança controlada: requisito aprovado só muda com CHANGE que o cite
    out = session(['/req edit REQ-302 :: Cancelamento até 12 h antes', '/change new --approved-by responsável --targets REQ-302 clínica reduziu a antecedência', '/req edit REQ-302 --change CHANGE-0001 :: Cancelamento até 12 h antes libera o horário em até 1 minuto']);
    expect(out).toMatch(/CHANGE_REQUIRED|CHANGE-XXXX/);
    expect(out).toMatch(/criada CHANGE-0001/);
    expect(out).toMatch(/REQ-302 atualizado \(CHANGE-0001\)/);

    // 2 fases, 3 tarefas rastreáveis; tarefa sem requisito ou com requisito inexistente é recusada
    out = session([
      '/phase new MVP agenda', '/phase new Notificações',
      '/task new PHASE-01 Tela de agendamento --reqs REQ-301,REQ-019',
      '/task new PHASE-01 Cancelamento --reqs REQ-302',
      '/task new PHASE-02 Lembrete --reqs REQ-303',
      '/task new PHASE-02 Tarefa solta',
      '/task new PHASE-02 Tarefa fantasma --reqs REQ-999',
    ]);
    expect(out.match(/criada TAR-\d{4}/g)).toHaveLength(3);
    expect(out).toMatch(/must cite at least one requirement/);
    expect(out).toMatch(/REQ-999 not found/);

    // PASS só com evidência real; N/A em CORE só com aprovação explícita
    writeFileSync(path.join(p.dir, 'evidencia.md'), '# teste de agendamento: 3/3\n');
    out = session(['/req set REQ-301 PASS', '/req set REQ-301 PASS --evidence evidencia.md', '/req set REQ-001 N/A não se aplica', '/req set REQ-001 N/A --approved-by responsável produto interno sem nome público', '/req REQ-301']);
    expect(out).toMatch(/PASS requires evidence/);
    expect(out).toMatch(/REQ-301 → PASS \(evidência evidencia\.md\)/);
    expect(out).toMatch(/is CORE: N\/A only as an explicitly approved exception/);
    expect(out).toMatch(/REQ-001 → N\/A/);

    // rastreabilidade gerada: requisito → fase → tarefa e matriz com evidência e aprovação
    const trace = readFileSync(path.join(p.dir, '.ases/TRACEABILITY.csv'), 'utf8');
    expect(trace).toMatch(/"REQ-301","PHASE-01","TAR-0001"/);
    expect(trace).toMatch(/"REQ-303","PHASE-02","TAR-0003"/);
    const matrix = readFileSync(path.join(p.dir, '.ases/REQUIREMENTS-MATRIX.csv'), 'utf8').trim().split('\n');
    expect(matrix).toHaveLength(1 + 303);
    expect(matrix.find((l) => l.startsWith('"REQ-301"'))).toMatch(/"PASS","responsável","evidencia\.md#[0-9a-f]{12}".*"TAR-0001"/);
    expect(matrix.find((l) => l.startsWith('"REQ-001"'))).toMatch(/exceção aprovada por responsável/);
    const decisions = readFileSync(path.join(p.dir, '.ases/DECISIONS.md'), 'utf8');
    expect(decisions).toMatch(/\| DEC-0002 \| A\.2 .* \| SUPERSEDED \|/);
    expect(decisions).toMatch(/\| CHANGE-0001 \| clínica reduziu a antecedência \| REQ-302 \| responsável \|/);
  }, 120_000);
});
