import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { repoRoot } from '@aer/git-bridge';
import { currentDecisions, nextRound } from '@aer/ases-methodology';
import type { Engine } from './engine.ts';
import { discoveryQuestions, handleMethodology } from './methodology-commands.ts';

// PHASE-23: /iniciar-projeto — o caminho guiado da metodologia no próprio chat:
// preparação (Git + fontes + G0) → entrevista ASES-500 → requisitos do sistema (REQ-301+) → ASES-300 (300 gerais) → GitHub.
// Tudo passa pelos comandos de metodologia que já existem (/spec, /req, /gate); aqui só se guia e se mostra o progresso.

type Stage = 'ases500' | 'name' | 'reqs' | 'ases300' | 'github' | 'done';
const run = promisify(execFile);

/** `gh repo create`: privado por padrão, a partir desta pasta, com o remote origin. Nome validado (vai num vetor, sem shell). */
export function githubCreateArgs(name: string, isPublic: boolean): string[] {
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) throw new Error(`nome de repositório inválido: ${name}`);
  return ['repo', 'create', name, isPublic ? '--public' : '--private', '--source', '.', '--remote', 'origin', '--push'];
}

const HINT_500 = 'Responda em texto livre (confirmada) · /proposta <texto> · /na <motivo> · /pular · /sair-entrevista';
const HINT_300 = 'Enter = se aplica · /na <motivo> = não se aplica · /aplicar-resto · /sair-entrevista';

export class Onboarding {
  stage: Stage = 'done';
  private current: string | undefined;
  private readonly skipped = new Set<string>();
  private name: string | undefined;
  private index = 0;
  private readonly engine: Engine;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  get active(): boolean {
    return this.stage !== 'done';
  }

  private m(cmd: string, ...args: string[]): string {
    const [sub, ...rest] = args;
    return handleMethodology(this.engine, cmd, sub, rest);
  }

  async start(): Promise<string> {
    const out: string[] = [];
    const root = this.engine.projectRoot;
    if (!(await repoRoot(root).then(() => true, () => false))) {
      // os planos em paralelo usam worktrees: o projeto precisa de Git com um primeiro commit
      await run('git', ['init', '-q'], { cwd: root });
      await run('git', ['-c', 'user.name=ASES', '-c', 'user.email=ases@aer.invalid', 'commit', '-q', '--allow-empty', '-m', 'ASES: início do projeto'], { cwd: root });
      out.push('Git iniciado nesta pasta (primeiro commit vazio).');
    }
    if (this.engine.store.listRequirements('GENERAL').length < 300) out.push(this.m('/ases', 'import'));
    out.push(this.m('/gate', 'G0'));
    this.stage = 'ases500';
    out.push('', 'Entrevista ASES-500: as perguntas da metodologia, uma por vez (dá para parar e voltar com /iniciar-projeto).', this.next500());
    return out.join('\n');
  }

  private next500(): string {
    const qs = discoveryQuestions(this.engine);
    const decisions = this.engine.store.listDecisions();
    const q = qs.find((x) => !this.skipped.has(x.id) && nextRound([x], decisions, 1).length > 0);
    if (!q) {
      this.stage = 'name';
      const cur = currentDecisions(this.engine.store.listDecisions()).size;
      return [`Entrevista concluída (${cur} decisões${this.skipped.size ? `, ${this.skipped.size} pulada(s) e ainda em aberto` : ''}).`, '', 'Requisitos do seu sistema: qual o seu nome (para aprovar os requisitos)?'].join('\n');
    }
    this.current = q.id;
    return [`Pergunta ${q.id} (${qs.indexOf(q) + 1}/${qs.length}) · ${q.trackTitle}`, `  ${q.text}`, HINT_500].join('\n');
  }

  private next300(): string {
    const all = this.engine.store.listRequirements('GENERAL');
    const r = all[this.index];
    if (!r) return this.finish300();
    this.current = r.id;
    return [`ASES-300 · ${r.id} (${this.index + 1}/${all.length}) · ${r.classification} · ${r.priority}`, `  ${r.title}`, HINT_300].join('\n');
  }

  private finish300(): string {
    this.stage = 'github';
    const folder = this.engine.projectRoot.split(/[\\/]/).at(-1) ?? 'projeto';
    const slug = folder.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'projeto';
    return [this.m('/gate', 'G1'), '', `Criar o repositório no GitHub? /github sim [nome] (padrão: ${slug}, privado) · /github sim ${slug} publico · /github nao`].join('\n');
  }

  /** Uma linha enquanto o modo guiado está ativo; undefined = não é do modo guiado (segue o fluxo normal). */
  async handle(line: string): Promise<string | undefined> {
    const t = line.trim();
    if (t === '/sair-entrevista') {
      this.stage = 'done';
      return 'Modo guiado pausado; tudo o que foi respondido está salvo. Para continuar de onde parou, continue com /iniciar-projeto.';
    }
    switch (this.stage) {
      case 'ases500': {
        const q = this.current!;
        if (t === '/pular') this.skipped.add(q);
        else if (t.startsWith('/proposta ')) this.m('/spec', 'propose', q, t.slice(10));
        else if (t.startsWith('/na ')) this.m('/spec', 'na', q, t.slice(4));
        else if (t.startsWith('/')) return undefined;
        else if (!t) return `Responda à pergunta ${q} (ou /pular).`;
        else this.m('/spec', 'answer', q, t);
        return this.next500();
      }
      case 'name':
        if (t.startsWith('/') || !t) return t.startsWith('/') ? undefined : 'Digite o seu nome.';
        this.name = t;
        this.stage = 'reqs';
        return 'Agora os requisitos do seu sistema, um por linha, no formato  título :: critério de aceite verificável\nExemplo: Agendar consulta :: paciente escolhe um horário livre e recebe confirmação\n/pronto quando terminar.';
      case 'reqs': {
        if (t === '/pronto') {
          this.stage = 'ases300';
          this.index = 0;
          return ['ASES-300: os 300 requisitos gerais da metodologia, um por vez.', this.next300()].join('\n');
        }
        if (t.startsWith('/')) return undefined;
        const [title = '', acceptance = ''] = t.split('::').map((x) => x.trim());
        if (!title || !acceptance) return 'Use o formato  título :: critério de aceite (ou /pronto).';
        const last = this.engine.store.listDecisions().at(-1)?.id ?? 'DEC-0001';
        const created = /REQ-\d+/.exec(this.m('/req', 'add', 'HIGH', last, `${title} :: ${acceptance}`))![0];
        this.m('/req', 'approve', created, this.name!);
        return `${created} criado e aprovado por ${this.name}. Próximo (ou /pronto).`;
      }
      case 'ases300': {
        const id = this.current!;
        if (t === '/aplicar-resto') return this.finish300();
        if (t.startsWith('/na ')) this.m('/req', 'set', id, 'N/A', t.slice(4), '--approved-by', this.name ?? 'responsável');
        else if (t.startsWith('/')) return undefined;
        // Enter (ou qualquer texto) = se aplica: o requisito continua PENDING, para ser cumprido no desenvolvimento
        this.index++;
        return this.next300();
      }
      case 'github': {
        const m = /^\/github\s+(sim|nao|não)(?:\s+(\S+))?(?:\s+(publico|público))?$/i.exec(t);
        if (!m) return t.startsWith('/') ? undefined : 'Responda /github sim [nome] [publico] ou /github nao.';
        this.stage = 'done';
        if (m[1]!.toLowerCase() !== 'sim') return 'Projeto iniciado pela metodologia. Peça no chat o que construir, citando os requisitos (ex.: "crie o agendamento (REQ-301)").';
        const folder = this.engine.projectRoot.split(/[\\/]/).at(-1) ?? 'projeto';
        const name = m[2] ?? (folder.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'projeto');
        try {
          const r = await run('gh', githubCreateArgs(name, Boolean(m[3])), { cwd: this.engine.projectRoot, timeout: 120_000 });
          return `Repositório criado (${m[3] ? 'público' : 'privado'}): ${(r.stdout || r.stderr).trim().split('\n').find((l) => l.includes('github.com')) ?? name}\nProjeto iniciado pela metodologia.`;
        } catch (err) {
          const e = err as { stderr?: string; message: string };
          return `Não consegui criar o repositório: ${(e.stderr ?? e.message).trim().split('\n').slice(-2).join(' ')}\n(o gh precisa estar instalado e logado: gh auth login). O projeto local está pronto.`;
        }
      }
      default:
        return undefined;
    }
  }
}

const sessions = new WeakMap<Engine, Onboarding>();
export function onboarding(engine: Engine): Onboarding {
  let o = sessions.get(engine);
  if (!o) sessions.set(engine, (o = new Onboarding(engine)));
  return o;
}
