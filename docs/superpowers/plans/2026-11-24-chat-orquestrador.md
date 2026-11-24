# AER 1.1.0: chat com IA principal e orquestração em paralelo. Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fazer o `ases` abrir num chat com uma IA principal escolhida pelo usuário. A principal conversa e edita (com `/desfazer`). O ASES divide os pedidos grandes em tarefas e as distribui entre as outras IAs, em paralelo, com revisão cruzada, troca automática e testes obrigatórios. Junto vêm o banner EUREKA42 verde, os comandos simples em português, o assistente de primeiro uso e o `/sobre`.

**Architecture:** a abordagem é "turnos com plano".
- **O turno:** cada mensagem é uma execução da principal pelo contrato `AgentProvider` existente, com `WORKTREE_WRITE` na raiz do projeto.
- **O plano:** a resposta pode trazer um bloco `aer-plan` (JSON). O scheduler o converte em tarefas, e o `runQueue` existente as executa.
- **A qualidade:** um laço novo (`chat-quality.ts`) encadeia teste, retrabalho, troca de IA e revisão cruzada, reusando `runAttempt`, `runReview`, `writeHandoff` e o runner de testes.
- **O estado:** fica em tabelas novas da migração 5, e toda mudança é evento.

**Tech Stack:**
- **Base:** TypeScript 6, Node ≥ 22.18 (`node:sqlite`), Ink 8 e React 19, zod 4, vitest.
- **Execução:** git CLI, os bins `ases`/`ases-tar` e os e2e com processos reais (pty e ConPTY no CI).

**Spec:** `docs/superpowers/specs/2026-11-24-chat-orquestrador-design.md` (APROVADO, 24/11/2026).

## Global Constraints
- **Versão e marca:** `VERSIONS.app` = `1.1.0`. Fase `PHASE-18`, branch `ases/PHASE-18`, e tarefas novas no engine a partir da TAR-0078.
- **Merge:** fast-forward na `main` só com a aprovação explícita do responsável.
- **Sem dependências novas** (ink, react e zod já existem).
- **Processos:** sem shell (`shell:false`), sem servidor de rede e sem MCP nas sessões. Os shims `.cmd` são resolvidos por `spawnManagedProcess`.
- **Consentimento:**
  - uma IA real só roda com consentimento **por IA, por sessão do `ases`** (`ApprovalGranted` com scope `provider-session`);
  - com `--save`, o consentimento é gravado em `.ases/CONFIG.json` `chat.consent[]`, e o `/config` revoga;
  - o simulador nunca pede consentimento e tudo dele aparece com `[SIMULADO]`.
- **Paralelismo:** `maxPerProvider` é 1 por IA real por padrão. Subir acima de 1 exige confirmação.
- **Principal:**
  - é excluída da atribuição quando existe outra IA READY;
  - nunca escreve em `.git/**`, `.ases/**` nem em arquivos ignorados por segredo (`.env*`, `*.pem`, `*.key`).
- **Tarefas:** nenhuma tarefa de executora entra no projeto sem `/aceitar`.
- **Limites:** no máximo 2 trocas automáticas e 2 retrabalhos por tarefa. Depois disso, BLOCKED com motivo.
- **Testes:** "sem teste configurado" nunca conta como PASS.
- **Verde:** `#22C55E`. O tema `green` é o padrão do `auto` em 24 e 8 bits; `NO_COLOR` sai sem nenhum código de cor.
- **Banner:** aparece com ≥ 72 colunas e Unicode. Sem Unicode, um banner ASCII com `#`/`=`.
- **Linha de status sob o banner:** `⌘  ASES Engineering Runtime · eureka42.org · principal: <ia> · <n> IAs prontas`.
- **Texto do `/sobre`** (literal, três linhas):
  ```
  ⌘ Eureka42 · ASES Engineering Runtime (AER) <versão>
  O Eureka42 é uma iniciativa dos Professores Raul el Greco, Giuseppe Favato e Elzo Brito.
  eureka42.org · Licença CC BY-NC-ND 4.0
  ```
- **Comandos:** em português, cada um com o alias em inglês do §5.4 do spec. O número curto `12` é igual a `TAR-0012`.
- **Rede de saída:** a única é a consulta do `ases update`/`/atualizar` ao registro npm, só quando o usuário pede.
- **Comandos técnicos existentes:** todos continuam funcionando e passam a aparecer em `/ajuda avançado`.
- **Erro do provider:** aparece como erro no chat (`ChatTurnFailed`), nunca como texto de resposta.
- **Verificação:** rastreabilidade AER-REQ, PHASE e TAR, evidência em `.ases/evidence/PHASE-18-verify.md` e `npm run verify` verde antes de cada commit.

## Review Focus
1. **A principal edita e o usuário mexe no mesmo arquivo:** `/desfazer` precisa recusar e listar os arquivos, sem sobrescrever o trabalho humano. O teste fica na Tarefa 6.
2. **O `aer-plan` vem malformado, com provider inexistente, `dependsOn` fora do intervalo ou ciclo:** nada é executado e o chat mostra o erro com o motivo. O teste fica na Tarefa 5.
3. **Todas as IAs estão ocupadas, sem consentimento ou em cooldown quando o plano chega:** a tarefa espera ("aguardando IA livre"), nunca vai para a principal se houver outra IA instalada, e o motivo aparece. O teste fica na Tarefa 5.
4. **Mensagem enviada enquanto um turno da principal ainda roda:** ela entra na fila, aparece como "na fila" e é processada depois, na ordem. Não abre uma segunda sessão da mesma IA. O teste fica na Tarefa 7.
5. **O histórico passa do limite do argv no Windows (~32 KB):** o prompt é truncado ou resumido no orçamento, e a mensagem não se perde. O teste fica na Tarefa 7.

---

### Task 1: Verde, banner, `/sobre` e eureka42.org na marca

**Files:**
- Modify: `packages/branding/src/index.ts`
  - adicionar o tema `green` a `THEMES`;
  - adicionar `'banner'` a `LOGO_MODES`;
  - `auto` passa a resolver para `green`;
  - novos `renderBanner`, `ABOUT_LINES` e `SITE`.
- Modify: `branding/BRAND_TOKENS.json` (`green`, `banner`), `docs/BRANDING_EUREKA42.md` (contraste do verde).
- Modify: `packages/tui-shared/src/index.tsx`: o `BrandHeader` passa a aceitar a prop `banner?: { main: string; ready: number }`.
- Test: `packages/branding/test/branding.test.ts`.

**Interfaces:**
- Produces:
  - `THEMES.green: { accent: '#22C55E', … }`.
  - `LOGO_MODES = ['banner','full','compact','minimal','ascii']`.
  - `pickLogoMode(caps, requested?)`. Sem pedido: `'banner'` se `columns >= 72` e há Unicode. `'banner'` pedido sem Unicode devolve `'ascii-banner'`, um valor interno renderizado por `renderBanner`.
  - `renderBanner(o: { color: boolean; colorDepth?: 0|4|8|24; unicode: boolean; theme?: ThemeName; main?: string; ready?: number; version?: string }): string`, que devolve 7 linhas.
  - `SITE = 'eureka42.org'`.
  - `aboutText(version: string): string`, que devolve as 3 linhas literais das Global Constraints.

- [ ] **Step 1: Write the failing tests**

```ts
it('banner: 6 block rows + status line, green, ≤ 72 cols', () => {
  const b = renderBanner({ color: true, colorDepth: 24, unicode: true, main: 'claude', ready: 5 }).split('\n');
  expect(b).toHaveLength(7);
  expect(Math.max(...b.map((l) => [...stripAnsi(l)].length))).toBeLessThanOrEqual(72);
  expect(b[0]).toContain('\u001b[38;2;34;197;94m');
  expect(stripAnsi(b[6])).toBe('⌘  ASES Engineering Runtime · eureka42.org · principal: claude · 5 IAs prontas');
});
it('banner without unicode uses only ASCII', () => {
  expect(renderBanner({ color: false, unicode: false })).toMatch(/^[\x20-\x7e\n]+$/);
});
it('banner respects depth and NO_COLOR', () => {
  expect(renderBanner({ color: true, colorDepth: 4, unicode: true })).not.toMatch(/38;2;/);
  expect(renderBanner({ color: false, unicode: true })).not.toMatch(/\u001b\[/);
});
it('pickLogoMode chooses banner at ≥72 cols', () => {
  expect(pickLogoMode({ columns: 72, unicode: true })).toBe('banner');
  expect(pickLogoMode({ columns: 71, unicode: true })).toBe('compact');
});
it('green contrast is measured (≥3:1 on black)', () => {
  expect(contrast('#22C55E', '#000000')).toBeGreaterThan(9);
  expect(contrast('#22C55E', '#FFFFFF')).toBeLessThan(2.5);
});
it('auto resolves to green at 24/8 bits', () => {
  expect(resolveTheme('auto', 24)).toBe('green');
  expect(resolveTheme('auto', 8)).toBe('green');
});
it('about text is the literal approved by the owner', () => {
  expect(aboutText('1.1.0')).toBe('⌘ Eureka42 · ASES Engineering Runtime (AER) 1.1.0\nO Eureka42 é uma iniciativa dos Professores Raul el Greco, Giuseppe Favato e Elzo Brito.\neureka42.org · Licença CC BY-NC-ND 4.0');
});
```
`contrast` é o helper WCAG que o teste já usa para o blue/gold.

- [ ] **Step 2: Run the tests and confirm they fail**
  Run: `npx vitest run packages/branding`. Expected: FAIL (`renderBanner`/`aboutText` not exported).

- [ ] **Step 3: Implement**
  - **Linhas 1 a 6:** as 6 linhas do banner são copiadas literalmente do desenho aprovado no §5.5 do spec, o ANSI Shadow "EUREKA 42".
  - **Banner ASCII:** é a mesma forma com `█`→`#` e com os caracteres de caixa (`╗║╔╝╚═`) trocados por `=`.
  - **Cor:** a cor sai de `fgCode(THEMES[theme].accent, depth)`.
  - **Linha 7:** `⌘` (ou `[E42]` sem Unicode) + `  ASES Engineering Runtime · eureka42.org` + os campos opcionais.
  - **`BrandHeader`:** quando o modo é `banner`, renderiza o `renderBanner` em várias linhas, em vez do compacto.

- [ ] **Step 4: Run the tests and confirm they pass**
  Run: `npx vitest run packages/branding packages/tui-shared`. Expected: PASS.

- [ ] **Step 5: Commit**
  `git commit -am "PHASE-18: banner EUREKA42 verde, tema green, aboutText e eureka42.org (TAR-0078)"`

### Task 2: Config `chat` (principal, modo, limites, revisão, teste e consentimento)

**Files:**
- Modify: `packages/project-store/src/index.ts`, com o leitor e o gravador do bloco `chat`, por camada.
- Test: `packages/project-store/test/project-store.test.ts`.

**Interfaces:**
- Produces:
  - **Tipo `ChatConfig`:**
    ```
    { main?: ProviderId;
      mode: 'manual'|'auto'|'hybrid';
      limits: Record<string, number>;
      crossReview: boolean;
      testCommand?: string[];
      consent: string[] }
    ```
  - **`chatConfig(root: string | undefined, globalFile?: string): ChatConfig & { sources: Record<keyof ChatConfig, string> }`:** a precedência é projeto > global > padrão. Os padrões são `mode 'manual'`, `limits {}` (que significa 1), `crossReview true` e `consent []`.
  - **`saveChatConfig(target: 'project'|'global', root: string | undefined, patch: Partial<ChatConfig>, globalFile?: string): void`:** faz merge raso no JSON existente e preserva as outras chaves (`ui` etc.). A gravação é atômica (tmp + rename).
  - **Validação:** valor inválido lança `ProjectError('CONFIG_INVALID', '<arquivo>: chat.<campo> …')`.

- [ ] **Step 1: Failing tests**
  - `it('chat config: project overrides global, defaults otherwise')`: o global tem `{chat:{main:'codex',mode:'auto'}}` e o projeto tem `{chat:{main:'claude'}}`. Espera `main 'claude'` (source `.ases/CONFIG.json`), `mode 'auto'` (source = arquivo global) e `crossReview true` (source `default`).
  - `it('saveChatConfig keeps other keys and is atomic')`: o projeto com `{"ui":{"theme":"blue"}}`, depois `saveChatConfig('project', root, {main:'kimi'})`. O arquivo passa a ter `ui.theme 'blue'` e `chat.main 'kimi'`.
  - `it('invalid chat values name the file')`: `chat.mode 'turbo'` lança uma mensagem contendo `CONFIG.json` e `chat.mode`.
- [ ] **Step 2:** Run: `npx vitest run packages/project-store -t "chat"`. Expected: FAIL.
- [ ] **Step 3:** Implement. Usa o `readUi`/`globalConfigFile` existentes como modelo, com um schema zod para `chat`.
- [ ] **Step 4:** Run: `npx vitest run packages/project-store`. Expected: PASS.
- [ ] **Step 5:** Commit `"PHASE-18: config chat por camadas (TAR-0079)"`

### Task 3: Eventos, migração 5 e store da conversa

**Files:**
- Modify: `packages/contracts/src/events.ts`, com os eventos e payloads críticos.
- Modify: `packages/persistence/src/migrations.ts` (migração 5 `chat-conversations`) e `packages/persistence/src/project-store.ts` (métodos novos).
- Modify: `packages/contracts/src/versions.ts` (`dbSchema: 5` e `app: '1.1.0'`).
- Test: `packages/persistence/test/chat.test.ts` (novo) e `packages/persistence/test/migrations.test.ts`.

**Interfaces:**
- **Novos `EVENT_TYPES`:** `ConversationStarted`, `ChatMessageAdded`, `MainProviderChanged`, `PlanProposed`, `PlanDecided`, `ChatTurnFailed`, `RestorePointCreated`, `RestorePointApplied`.
- **Payloads críticos:**
  - `ChatMessageAdded`: `{ conversationId: /^CNV-\d{4,}$/, n: int≥1, role: 'user'|'main'|'system', provider: string|null, text: string, redacted: boolean, truncated: boolean }`.
  - `PlanProposed`: `{ conversationId, planId: /^PLN-\d{4,}$/, tasks: {title, provider, kind, dependsOn: int[]}[], reasons: string[] }`.
  - `PlanDecided`: `{ planId, decision: 'approved'|'edited'|'cancelled'|'auto', by: string }`.
  - `RestorePointCreated`: `{ conversationId, n: int, ref: string, commit: string, files: string[] }`.
- **Tabelas da migração 5:**
  - `conversations(project_id, id CNV-…, main TEXT, mode TEXT, phase_id TEXT NULL, started_at)`;
  - `chat_messages(project_id, conversation_id, n INT, role, provider, text, created_at, PK(project_id, conversation_id, n))`;
  - `plans(project_id, id PLN-…, conversation_id, state CHECK IN ('PENDING','APPROVED','CANCELLED','RUNNING','DONE'), tasks_json, created_at)`;
  - `restore_points(project_id, conversation_id, n, ref, commit_sha, files_json, applied_at NULL)`.
- **Métodos do `ProjectStore`:**
  - `startConversation(main: string, mode: ChatMode): string` (CNV-id);
  - `currentConversation(): ConversationRow | undefined` (a mais recente);
  - `addChatMessage(cnv: string, m: { role: 'user'|'main'|'system'; provider: string|null; text: string }): number`: redige com `redactText` de `@aer/provider-sdk`, porque `persistence` não depende de provider-sdk. Mover o `redactText` para `@aer/contracts` e reexportá-lo de provider-sdk, mantendo a API.
  - `listChatMessages(cnv: string, limit?: number): ChatMessageRow[]`;
  - `setMainProvider(cnv: string, main: string): void`;
  - `setConversationMode(cnv: string, mode: ChatMode): void`;
  - `setConversationPhase(cnv: string, phaseId: string): void`;
  - `proposePlan(cnv: string, tasks: PlannedTask[], reasons: string[]): string` (PLN-id);
  - `getPlan(id: string): PlanRow | undefined`;
  - `pendingPlan(cnv: string): PlanRow | undefined`;
  - `decidePlan(id: string, decision: 'approved'|'edited'|'cancelled'|'auto', by: string, tasks?: PlannedTask[]): void`;
  - `setPlanState(id: string, s: 'RUNNING'|'DONE'): void`;
  - `addRestorePoint(cnv: string, r: { ref: string; commit: string; files: string[] }): number`;
  - `lastRestorePoint(cnv: string): RestorePointRow | undefined`;
  - `markRestoreApplied(cnv: string, n: number): void`.
- **Tipos:**
  - `PlannedTask = { title: string; instructions: string; provider: string; kind: 'code'|'test'|'docs'|'review'|'other'; dependsOn: number[] }`;
  - `ChatMode = 'manual'|'auto'|'hybrid'`.

- [ ] **Step 1: Failing tests** (`chat.test.ts`)
  - `it('conversation lifecycle emits events in order')`: start, addChatMessage ×2, setMainProvider, proposePlan e decidePlan. Os `eventType`s devem ser `[ConversationStarted, ChatMessageAdded, ChatMessageAdded, MainProviderChanged, PlanProposed, PlanDecided]`.
  - `it('chat text is redacted before storage')`: a mensagem `'token sk-ant-abc123456789012345678901234567890'` é guardada com o texto sem `sk-ant-` e com `redacted:true`.
  - `it('only one PENDING plan per conversation')`: um segundo `proposePlan` com um plano pendente marca o anterior como `CANCELLED` (evento `PlanDecided` `cancelled`, by `system`).
  - Em `migrations.test`: `it('migration 5 applies on a v4 database and keeps data')`.
- [ ] **Step 2:** Run: `npx vitest run packages/persistence -t "conversation|chat|migration 5"`. Expected: FAIL.
- [ ] **Step 3:** Implement, seguindo o padrão de `createPhase`/`requestApproval`: transação, linha na tabela e `appendEvent`.
- [ ] **Step 4:** Run: `npx vitest run packages/persistence packages/contracts packages/provider-sdk`. Expected: PASS.
- [ ] **Step 5:** Commit `"PHASE-18: eventos e store da conversa, migração 5 (TAR-0080)"`

### Task 4: Simulador: cenário `chat` e vários simuladores

**Files:**
- Modify: `packages/provider-simulator/agent/sim-agent.mjs` (cenário `chat`) e `packages/provider-simulator/src/index.ts` (`SIMULATOR_SCENARIOS` mais `chat`; nova opção `id`).
- Modify: `apps/ases-cli/src/engine.ts`, onde `Engine.start(root, adapter, o?: { simulators?: number })` registra `simulator`, `simulator-2`, ….
- Modify: `apps/ases-cli/src/main.ts`, que lê `AER_SIMULATORS` (inteiro de 1 a 4, padrão 1), documentado no `--help` como "só para testes".
- Test: `packages/provider-simulator/test/simulator.test.ts`.

**Interfaces:**
- **`new SimulatorProvider(platform, { id?: string })`:** `id` tem o padrão `'simulator'`, e o `probe().providerId` é igual ao `id`.
- **Cenário `chat`:** lê o arquivo de instruções e procura a última linha `## Mensagem do usuário` e o texto depois dela.
  - **A mensagem contém "edite":** escreve `SIMULATED/CHAT.md`, com `file_change` modify/create, e responde `SIMULATED: editei SIMULATED/CHAT.md`.
  - **A mensagem contém "tarefas" ou "divida":** responde `SIMULATED: proposta abaixo` mais um bloco `aer-plan` com 3 tarefas fixas (`Parte 1/2/3`, `kind 'code'`, a 3 com `dependsOn:[1]`).
  - **A mensagem começa com "RESUMO":** responde `SIMULATED: resumo — <n> tarefas`, contando as linhas `- TAR-`.
  - **Senão:** `SIMULATED: entendi — <eco de 60 chars>`.
  - **Regra geral:** toda mensagem começa com `SIMULATED:`.

- [ ] **Step 1: Failing tests**
  - `it('chat scenario proposes an aer-plan when asked to split work')`: o resultado tem uma mensagem com ```` ```aer-plan ```` e um JSON com `tasks.length === 3`.
  - `it('chat scenario edits when asked')`: emite `file_change` e o arquivo existe no `cwd`.
  - `it('extra simulator ids are distinct providers')`: o `probe().providerId` de `{id:'simulator-2'}` é `'simulator-2'` e o `simulated` é true.
- [ ] **Step 2:** Run: `npx vitest run packages/provider-simulator`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run: the same command. Expected: PASS.
- [ ] **Step 5:** Commit `"PHASE-18: simulador de chat e múltiplos simuladores (TAR-0081)"`

### Task 5: Parser do `aer-plan` e atribuição de IAs

**Files:**
- Create: `packages/scheduler/src/chat-plan.ts` (exportado no `index.ts`).
- Test: `packages/scheduler/test/chat-plan.test.ts`.

**Interfaces:**
- **`parseMainReply(text: string): { reply: string; plan?: RawPlan; error?: string }`:**
  - extrai o **último** bloco ```` ```aer-plan … ``` ````;
  - `reply` é o texto sem o bloco;
  - o JSON é validado com zod: `{ tasks: [{ title (1..120), instructions (1..8000), kind?, dependsOn? (int ≥1, 1-based), prefer? }] (1..12) }`;
  - erros: JSON inválido, índice fora do intervalo, ciclo ou auto-dependência, com uma mensagem em português.
- **`assignProviders(plan: RawPlan, c: { ready: string[]; main: string; busy: Record<string, number>; limits: Record<string, number>; consented: Set<string> }): { tasks: PlannedTask[]; reasons: string[] }`:**
  - **Candidatos:** `ready` sem a `main`. Se esse conjunto ficar vazio, usa só a `main`.
  - **Para cada tarefa:**
    1. a `prefer` se estiver entre os candidatos e `busy < limit`;
    2. senão, o candidato com o menor `busy/limit`; no empate, a ordem `claude, codex, kimi, opencode, google, simulator, simulator-2…`;
    3. incrementa o `busy` local.
  - **Motivo de cada atribuição:** `"<ia>: preferida pela principal"`, `"<ia>: a menos ocupada"` ou `"<ia>: única IA disponível (principal)"`.
  - **Sem candidato** (`ready` vazio): lança `StoreError('NO_PROVIDER', 'nenhuma IA pronta; rode /ias')`.

- [ ] **Step 1: Failing tests**
  - `it('extracts the last aer-plan and strips it from the reply')`.
  - `it('rejects invalid JSON, out-of-range dependsOn and cycles')`: são três casos; o `error` contém `JSON`, `dependsOn 4` e `ciclo`, respectivamente.
  - `it('never assigns the main when another IA is ready')`: `ready=['claude','codex','kimi']`, `main='claude'` e 3 tarefas dão `['codex','kimi','codex']`.
  - `it('honors prefer when free, otherwise least busy, with reasons')`.
  - `it('falls back to the main only when it is the only ready IA')`.
  - `it('throws NO_PROVIDER when nothing is ready')`.
- [ ] **Step 2:** Run: `npx vitest run packages/scheduler -t "aer-plan|assign"`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run: the same command. Expected: PASS.
- [ ] **Step 5:** Commit `"PHASE-18: parser aer-plan e atribuição explicada (TAR-0082)"`

### Task 6: Ponto de restauração e `/desfazer` (git-bridge)

**Files:**
- Modify: `packages/git-bridge/src/index.ts`.
- Test: `packages/git-bridge/test/git-bridge.test.ts`.

**Interfaces:**
- **`createRestorePoint(root: string, ref: string): Promise<{ commit: string; files: string[] }>`:**
  1. Constrói um commit com o **estado atual da árvore de trabalho**, incluindo os arquivos não rastreados e não ignorados. Para isso usa um index temporário (`GIT_INDEX_FILE` = arquivo em `.ases/tmp`): `git read-tree HEAD`, depois `git add -A`, `git write-tree` e `git commit-tree -p HEAD`.
  2. Grava esse commit em `ref` (`refs/ases/restore/CNV-XXXX/N`) com `git update-ref`.
  3. **Nunca toca** no index real, no HEAD nem no branch.
  4. `files` = a lista de caminhos com conteúdo diferente do HEAD.
- **`restoreFromPoint(root: string, ref: string, touchedByTurn: string[]): Promise<{ restored: string[] } | { refused: string[] }>`:**
  - **Antes de restaurar:** compara cada arquivo em `touchedByTurn` com o conteúdo que o turno deixou, gravado como `ref + '-after'` por `markTurnEnd`.
  - **Recusa:** se algum arquivo mudou depois do turno, devolve `{ refused: [...] }` sem alterar nada.
  - **Restauração:** para cada arquivo, `git checkout <ref> -- f` com o index temporário. Os criados pelo turno (ausentes em `ref`) são apagados.
- **`markTurnEnd(root: string, ref: string): Promise<{ touched: string[] }>`:** grava `ref-after` do mesmo jeito e devolve os arquivos diferentes entre `ref` e `ref-after`.

- [ ] **Step 1: Failing tests**
  - `it('restore point does not touch index, HEAD or branch')`: com um arquivo staged e outro modificado, compara `git status --porcelain` e `rev-parse HEAD` antes e depois. Devem ser iguais.
  - `it('undo restores edits and deletes files created by the turn')`.
  - `it('undo refuses when the user edited a file after the turn')`: devolve `{ refused: ['a.txt'] }` e mantém o conteúdo do usuário.
  - `it('untracked files are captured; ignored files are not')`.
- [ ] **Step 2:** Run: `npx vitest run packages/git-bridge -t "restore|undo"`. Expected: FAIL.
- [ ] **Step 3:** Implement. Usa o `git()` existente com `env` (adicionar `env?` ao helper `git`) e serializa por repo com o `serialized()` já existente.
- [ ] **Step 4:** Run: `npx vitest run packages/git-bridge`. Expected: PASS.
- [ ] **Step 5:** Commit `"PHASE-18: ponto de restauração e desfazer sem tocar no index/branch (TAR-0083)"`

### Task 7: Turno de chat da principal

**Files:**
- Create: `packages/scheduler/src/chat.ts`.
- Test: `packages/scheduler/test/chat.test.ts`.

**Interfaces:**
- Consumes:
  - da Tarefa 3, os métodos do store;
  - da Tarefa 5, `parseMainReply`;
  - da Tarefa 6, `createRestorePoint`/`markTurnEnd`;
  - o `WorkerDeps` existente;
  - o `buildPromptPack` como referência de orçamento.
- Produces:
  - **`buildMainPrompt(i: { project: string; phases: PhaseRow[]; openTasks: TaskRow[]; ready: string[]; main: string; history: ChatMessageRow[]; message: string; budgetChars?: number }): string`:**
    - o orçamento padrão é 24_000;
    - seções: papel da principal (pt-BR), "Você pode ler e editar o projeto", "Para trabalho grande, responda com um bloco aer-plan", o formato JSON, as IAs disponíveis, o projeto, o histórico e a linha `## Mensagem do usuário`;
    - o histórico é cortado do mais antigo para o mais novo até caber; se cortou, entra `[histórico anterior resumido: N mensagens]`.
  - **`runChatTurn(d: WorkerDeps, o: { conversationId: string; message: string; main: string; ready: string[]; signal: AbortSignal; onEvent?: (e: AgentStreamEvent) => void }): Promise<ChatTurnResult>`.**
  - **`ChatTurnResult = { ok: true; reply: string; planId?: string; planError?: string; restore?: { n: number; files: string[] } } | { ok: false; code: string; message: string }`.**
- **Comportamento do `runChatTurn`:**
  1. Grava a mensagem do usuário (`addChatMessage`).
  2. Checa o consentimento (`d.consented.has(main)` ou simulador). Sem ele, devolve `{ ok:false, code:'CONSENT_REQUIRED' }` sem rodar nada.
  3. Cria o ponto de restauração `refs/ases/restore/<cnv>/<n>`.
  4. Escreve as instruções em `.ases/tmp/<cnv>-<n>.md`.
  5. Roda `provider.start({ mode:'WORKTREE_WRITE', workingDirectory: d.root, deniedPaths:['.git','.ases','.env','.env.*','*.pem','*.key'], allowedPaths:['.'], taskId:'TAR-0000', attemptId: \`CHT-${n}\`, modelPreference: main==='simulator'?'chat':undefined, … })`.
  6. Repassa cada evento ao `onEvent`.
  7. Um `file_change` em caminho negado vira `SecurityViolationBlocked` e aborta o turno.
  8. Ao terminar, roda `markTurnEnd`; se `touched` não estiver vazio, `addRestorePoint`.
  9. Erro, exit ≠ 0 ou turno sem nenhuma mensagem visível geram `ChatTurnFailed` e `{ ok:false, … }`. Nesse caso o texto **não** é gravado como resposta.
  10. Sucesso: grava a resposta da principal e, se houver plano, `proposePlan` com `assignProviders`.
- **Fila:** um `ChatQueue` (classe no mesmo arquivo) com `enqueue(message): Promise<ChatTurnResult>` garante um turno por vez por conversa e expõe `pending: number`.

- [ ] **Step 1: Failing tests** (com o `SimulatorProvider` real)
  - `it('a plain message gets a SIMULATED reply stored as role main')`.
  - `it('an edit request writes the file and records a restore point')`.
  - `it('a split request stores a PENDING plan with assignments excluding the main')`: providers `simulator` (a principal), `simulator-2` e `simulator-3`.
  - `it('provider failure becomes ChatTurnFailed, never a reply')`: usa o cenário `fail` via `main='simulator'` com `modelPreference` forçado no teste.
  - `it('real provider without consent does not run')`: um provider falso com `requiresConsent:true` e um contador de `start`, que deve ficar em 0.
  - `it('queue runs turns one at a time in order')`: duas mensagens enfileiradas; o segundo `start` só começa depois do `exit` do primeiro.
  - `it('history beyond budget is trimmed, the new message is always kept')`: 200 mensagens de 500 chars. O prompt tem ≤ 24_000 chars, contém a mensagem nova e contém `resumido`.
- [ ] **Step 2:** Run: `npx vitest run packages/scheduler -t "chat"`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run: the same command. Expected: PASS.
- [ ] **Step 5:** Commit `"PHASE-18: turno de chat da principal com restauração e fila (TAR-0084)"`

### Task 8: Execução do plano e laço de qualidade

**Files:**
- Create: `packages/scheduler/src/chat-run.ts`.
- Modify: `apps/ases-cli/src/continuity-commands.ts`: extrair de `testRun` uma `runTestInWorktree(engine-like deps, taskId, argv): Promise<{ exitCode; passed; failed; total }>` reutilizável e movê-la para `packages/scheduler/src/test-run.ts`. O `/test` continua chamando essa função com a política de aprovação atual.
- Test: `packages/scheduler/test/chat-run.test.ts`.

**Interfaces:**
- Consumes: `runQueue`, `runReview`, `writeHandoff`, `parseProviderSpec`, `BLOCKING_ERROR_CODES` e os métodos do store da Tarefa 3.
- Produces:
  - **`executePlan(d: WorkerDeps, o: { planId: string; limits: Record<string, number>; crossReview: boolean; testCommand?: string[]; testsApproved: boolean; signal: AbortSignal; onProgress?: (p: PlanProgress) => void }): Promise<PlanResult>`.**
  - **`PlanProgress = { taskId: string; provider: string; state: TaskState; note?: string }`.**
  - **`PlanResult = { planId: string; tasks: { taskId: string; provider: string; state: TaskState; tests: 'PASS'|'FAIL'|'NONE'; review?: 'APPROVED'|'REJECTED'|'UNCLEAR'|'INVALID'; swaps: number; reworks: number; reason: string }[] }`.**
- **Comportamento do `executePlan`:**
  1. **Fase:** cria (ou reusa, via `conversations.phase_id`) a fase `Conversa CNV-XXXX` e a move para READY e RUNNING.
  2. **Tarefas:** uma por item, com `description` = instructions e `provider` = atribuída. O `dependsOn` vira `addDependency`. As tarefas vão para READY. `setPlanState RUNNING`.
  3. **Execução:** roda o `runQueue`, com `maxPerProvider` = limits (padrão 1) e `maxParallel` = soma dos limites.
  4. **Para cada tarefa que chega a REVIEW (laço de qualidade):**
     - **Com `testCommand` e `testsApproved`:** roda `runTestInWorktree`. Se falhar e `reworks < 2`, emite `TaskReworkRequested` com a saída do teste (redigida, ≤ 4 KB) no próximo HANDOFF, move para READY e volta à fila. Se falhar com `reworks == 2`, BLOCKED `TESTS_FAILING_AFTER_2_REWORKS`.
     - **Sem `testCommand`:** `tests: 'NONE'`, com a nota "sem teste configurado".
     - **Com `crossReview`:** `runReview` com outra IA: a principal se estiver livre e não for autora, senão a menos ocupada que não é autora. Grava o veredito.
  5. **Tarefa que termina BLOCKED com código em `RATE_LIMITED`, `PROVIDER_COOLDOWN`, `AUTH_EXPIRED`, `TIMEOUT` ou `PROCESS_TREE_NOT_RECONCILED`:**
     - **Com `swaps < 2` e outra IA livre:** `writeHandoff` (from → to, motivo), `setTaskProvider`, move para READY e volta à fila.
     - **Senão:** fica BLOCKED com o motivo.
  6. **Fim:** quando nada mais é elegível, `setPlanState DONE` e devolve o `PlanResult`.
- **`summaryMessage(r: PlanResult): string`:** a mensagem para o turno de resumo, que começa com `RESUMO DO PLANO <planId>` e traz uma linha `- TAR-XXXX <ia> <estado> testes:<x> revisão:<y> trocas:<n> refações:<n> — <motivo>` por tarefa.

- [ ] **Step 1: Failing tests** (simuladores `simulator-2`, `simulator-3`, …, projeto git temporário)
  - `it('3 tasks run in parallel across 2 IAs; dependsOn is respected')`: a tarefa 3 só fica RUNNING depois de a tarefa 1 estar em REVIEW (ordem dos eventos).
  - `it('failing tests send the task back for rework at most twice, then BLOCKED')`: `testCommand=[node,'-e','process.exit(1)']`; `reworks === 2`, estado BLOCKED e motivo `TESTS_FAILING_AFTER_2_REWORKS`.
  - `it('no test command never counts as PASS')`: `tests: 'NONE'`.
  - `it('rate-limit swaps to another IA with a handoff')`: com o cenário `rate-limit` em `simulator-2`, a tarefa termina em REVIEW com o provider `simulator-3`, `swaps 1` e um artefato `.ases/handoffs/` registrado.
  - `it('cross review runs with a non-author IA and records the verdict')`.
  - `it('summaryMessage lists every task with its outcome')`.
- [ ] **Step 2:** Run: `npx vitest run packages/scheduler -t "plan|rework|swap|cross"`. Expected: FAIL.
- [ ] **Step 3:** Implement. Para forçar cenários por provider nos testes, a tarefa pode ter `provider: 'simulator-2:rate-limit'` (já suportado por `parseProviderSpec`). O `assignProviders` preserva a preferência.
- [ ] **Step 4:** Run: `npx vitest run packages/scheduler apps/ases-cli`. Expected: PASS (`/test` sem regressão).
- [ ] **Step 5:** Commit `"PHASE-18: execução do plano com testes, refação, troca automática e revisão cruzada (TAR-0085)"`

### Task 9: Engine e comandos simples

**Files:**
- Modify: `apps/ases-cli/src/engine.ts`:
  - `chat(text)`, `pendingPlan`, `goPlan`, `editPlan`, `cancelPlan`, `setMain`, `consentSession`, `undo`, `acceptTask`, `stopConversation`;
  - consentimentos da sessão num `Set` em memória, mais os de `chat.consent` do config.
- Create: `apps/ases-cli/src/chat-commands.ts`: os comandos do §5.4 do spec, os aliases e o número curto.
- Modify: `apps/ases-cli/src/commands.ts`:
  - texto sem `/` vai para `engine.chat`;
  - remover de `PLANNED_SLASH` o `/agent`, `/auto`, `/manual`, `/hybrid`, `/plan` e `/history`;
  - o `SLASH_HELP` vira `/ajuda` por grupos, com `/ajuda avançado` mostrando o conteúdo atual.
- Test: `apps/ases-cli/test/chat-commands.test.ts` (novo).

**Interfaces:**
- **`resolveTaskRef(ref: string): string`:** `'12'` vira `'TAR-0012'`, `'TAR-0012'` fica igual e qualquer outra coisa lança `INVALID_INPUT`.
- **`CHAT_ALIASES: Record<string,string>`:** `{'/help':'/ajuda','/model':'/ia','/agent':'/ia','/agents':'/ias','/plan':'/plano','/tasks':'/tarefas','/diff':'/ver','/accept':'/aceitar','/redo':'/refazer','/assign':'/trocar','/undo':'/desfazer','/stop':'/parar','/new':'/nova','/settings':'/config','/about':'/sobre','/exit':'/sair'}`.
- **`/tasks`:** dentro de uma conversa, mostra as tarefas da conversa; fora dela, mantém o comportamento atual (`/tarefas`).
- **`/diff TAR-X ATT-Y`:** com dois argumentos, continua indo para o `/diff` técnico.
- **`/cancel`:** com TAR, mantém o comportamento técnico; sem argumento, descarta o plano pendente.
- **`/aceitar [n]`:**
  - para cada tarefa REVIEW da conversa (ou só a `n`), move para APPROVED e chama `mergeTask(store, root, id, { ownerId, target: currentBranch })`;
  - um `CONFLICT` aparece como "conflito em X; resolva e rode /aceitar n de novo";
  - um checkout sujo aparece como "salve ou desfaça suas mudanças antes (git status)".
- **`/config consentir <ia> [--save]` e `/config revogar <ia>`:** os equivalentes em modo linha do diálogo da TUI. Também `/config limite <ia> <n> --sim`, `/config revisão on|off`, `/config teste <comando…>` e `/config tema|logo …`.
- **`/sobre`:** devolve `aboutText(VERSIONS.app)`.
- **Decisão do plano por modo (`decidePlanMode(mode, plan, consented): 'ask'|'run'`):**
  - `manual`: `ask`;
  - `auto`: `run`;
  - `hybrid`: `run` se todas as IAs do plano estiverem consentidas e o plano tiver ≤ 3 tarefas, senão `ask`.
  - Teste: `it('hybrid runs small consented plans and asks otherwise')`.
- **`/doctor`:** devolve o resumo do `ases doctor` (os providers).

- [ ] **Step 1: Failing tests** (com o Engine sobre um projeto temporário e `AER_SIMULATORS=3`)
  - `it('plain text goes to the main and the reply is printed')`: a saída contém `SIMULATED: entendi`.
  - `it('every Portuguese command has its English alias')`: para cada par de `CHAT_ALIASES`, a saída do alias é igual à do comando.
  - `it('short task numbers resolve: /ver 1 == /ver TAR-0001')`.
  - `it('/ia shows and switches the main; /ias lists ready IAs')`.
  - `it('/plano, Enter-equivalent /plano executar, /cancel without TAR discards the plan')`.
  - `it('/auto toggles the mode and the next plan runs without asking')`.
  - `it('/desfazer restores the last main edit and refuses after user edits')`.
  - `it('/aceitar merges REVIEW tasks of the conversation into the current branch')`.
  - `it('/sobre prints the literal about text')`.
  - `it('/ajuda avançado still lists /phase, /task, /run, /gate')`.
  - `it('old technical commands keep working (/phase new, /task new, /run)')`.
- [ ] **Step 2:** Run: `npx vitest run apps/ases-cli -t "chat-commands|alias|/ia|/plano|/auto|/desfazer|/aceitar|/sobre|avançado|technical"`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run: `npx vitest run apps/ases-cli`. Expected: PASS.
- [ ] **Step 5:** Commit `"PHASE-18: engine de chat e comandos simples com aliases (TAR-0086)"`

### Task 10: TUI do chat, menu `/`, plano e assistente

**Files:**
- Modify: `apps/ases-cli/src/tui.tsx`:
  - banner no topo;
  - linha de status;
  - área de conversa (`você>`, `<ia>>`);
  - caixa do plano com `Enter`/`e`/`n`;
  - linhas de progresso das tarefas;
  - diálogo de consentimento (`s`/`n`/`sempre`);
  - "na fila";
  - menu `/` (filtro, ↑↓ e Enter).
- Create: `apps/ases-cli/src/wizard.tsx`: o assistente do §5.6 (TUI). Em modo linha, `runWizardLines(io)` usa perguntas numeradas.
- Modify: `apps/ases-cli/src/main.ts`:
  - roda o assistente quando `chatConfig(root).main` está ausente e há TTY;
  - em `--no-tui`, mostra "rode /config para escolher a principal (atual: <primeira READY>)".
- Test: `apps/ases-cli/test/tui.test.tsx` e `apps/ases-cli/test/wizard.test.tsx` (ink-testing do jeito que já existe).

**Interfaces:**
- **`SLASH_MENU: { cmd: string; desc: string }[]`:** a ordem e as descrições da tabela do spec §5.4.
- **`filterMenu(prefix: string): typeof SLASH_MENU`.**

- [ ] **Step 1: Failing tests**
  - `it('shows the green banner at 80 cols and the compact logo at 50')`.
  - `it('typing / opens the menu and /a filters to /ajuda /aceitar /auto')`.
  - `it('a split request shows the plan box; Enter runs it; progress lines appear')`.
  - `it('n cancels the plan; e lets you change the IA of item 1')`.
  - `it('consent dialog appears for a real provider and nothing runs before s')`: usa um provider falso com `requiresConsent`.
  - `it('wizard lists IAs, saves main/mode/limit/test to the chosen config')`.
  - `it('message typed during a running turn shows "na fila"')`.
- [ ] **Step 2:** Run: `npx vitest run apps/ases-cli/test/tui.test.tsx apps/ases-cli/test/wizard.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement. Mantém o `useInput` atual. O menu e o plano são estados novos do componente.
- [ ] **Step 4:** Run: the same command. Expected: PASS.
- [ ] **Step 5:** Commit `"PHASE-18: TUI de chat, menu /, plano, consentimento e assistente (TAR-0087)"`

### Task 11: `ases update` e `/atualizar`

**Files:**
- Create: `apps/ases-cli/src/update.ts`.
- Modify: `apps/ases-cli/src/main.ts` (subcomando `update [--check]`) e `apps/ases-cli/src/chat-commands.ts` (`/atualizar` e o alias `/update`).
- Move: `scripts/npm-cli.mjs` vira `packages/platform-core/src/npm.ts` (`npmCli()`), e o script passa a reexportar de lá.
- Test: `apps/ases-cli/test/update.test.ts`.

**Interfaces:**
- **`latestVersion(o?: { registry?: string; fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<string>`:**
  - faz o GET de `<registry>/@eureka42-ai%2faer`, com o registry padrão `https://registry.npmjs.org` ou `AER_REGISTRY`;
  - lê `dist-tags.latest`;
  - o timeout padrão é 10 s;
  - sem cabeçalhos com dados do usuário.
- **`installedFromNpmGlobal(binPath: string): boolean`:** verdadeiro se o bin estiver dentro de `<prefix>/lib/node_modules/@eureka42-ai/aer` (POSIX) ou de `<prefix>\node_modules\@eureka42-ai\aer` (Windows).
- **`runUpdate(o: { current: string; check: boolean; running: number; binPath: string; registry?: string; npm?: { cli: string; node: string } }): Promise<{ status: 'UP_TO_DATE'|'AVAILABLE'|'UPDATED'|'REFUSED'|'FAILED'; from: string; to?: string; message: string }>`.**
  - Comparação semver por `versionInRange`/major.minor.patch.
  - A instalação é um `spawn(node, [npmCli, 'install', '-g', '@eureka42-ai/aer@<to>'], { shell:false })`.
  - **`REFUSED`:** `running > 0` ("pare as tarefas antes (/parar)"), ou instalação fora do npm global ("rodando do repositório; use git pull && npm run build").

- [ ] **Step 1: Failing tests**
  - `it('reports UP_TO_DATE when latest equals current')`: o registro falso é um `fetchImpl` que devolve `{ 'dist-tags': { latest: '1.1.0' } }`.
  - `it('--check reports AVAILABLE without installing')`: o contador do npm falso fica em 0.
  - `it('installs the exact latest version without a shell')`: o npm falso (script node) grava os argv; espera `['install','-g','@eureka42-ai/aer@1.2.0']`.
  - `it('refuses while tasks are running')`.
  - `it('refuses when not installed from npm global')`.
  - `it('network failure leaves everything as is and shows the error')`: o `fetchImpl` rejeita, e o status é `FAILED` com a mensagem do erro.
- [ ] **Step 2:** Run: `npx vitest run apps/ases-cli -t "update"`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run: the same command, mais `node scripts/pack.mjs && node scripts/pack-smoke.mjs`. O smoke ganha `ases update --check` com `AER_REGISTRY=file://…` apontando para um JSON local. Expected: PASS.
- [ ] **Step 5:** Commit `"PHASE-18: ases update e /atualizar (TAR-0088)"`

### Task 12: Bins, documentação, e2e e release 1.1.0

**Files:**
- Modify:
  - `apps/ases-cli/src/main.ts`: `ases about` e `eureka42.org` no `--help`/`--version` (texto: `ases 1.1.0 (protocol 1) · eureka42.org`);
  - `apps/ases-tar/src/main.ts`: `--about`;
  - `scripts/pack.mjs`: `homepage: 'https://eureka42.org'`;
  - `docs/INSTALL.md`: uma seção "Primeiros passos" com o chat, `/ia` e `/ajuda`, e o `/sobre`;
  - `docs/RELEASE_NOTES_1.0.0.md`: uma seção 1.1.0;
  - `test/e2e/bins.test.mjs`: `--version` passa a incluir `eureka42.org`. Atualizar as regex.
- Create: `test/e2e/chat.test.mjs`: o fluxo completo com processos reais e `AER_SIMULATORS=3`.
- Modify: `test/e2e/pty.test.mjs` e `test/e2e/conpty.test.mjs`:
  - banner;
  - o menu `/` abre;
  - uma mensagem vira plano;
  - `Enter` executa até REVIEW;
  - `/sair`.
- Create: `.ases/evidence/PHASE-18-verify.md`.

- [ ] **Step 1: Failing e2e** (`chat.test.mjs`), com `ases --no-tui` e `AER_SIMULATORS=3`:
  1. `/config consentir simulator`;
  2. `olá`: espera `SIMULATED: entendi`;
  3. `edite o readme`: espera `editei`;
  4. `/desfazer`: espera `restaurado`;
  5. `divida em tarefas`: espera `PLN-0001`, 3 tarefas e IAs ≠ principal;
  6. `/plano executar`: espera três `TAR-` em REVIEW e `resumo — 3 tarefas`;
  7. `/aceitar`: espera `COMPLETED` ou `MERGED`;
  8. `/sobre`: espera o texto literal;
  9. `/sair`: exit 0;
  10. o `ases-tar --follow --format jsonl` noutro processo vê `PlanProposed`.
- [ ] **Step 2:** Run: `npm run build && npx vitest run test/e2e/chat.test.mjs`. Expected: FAIL antes do wiring, PASS depois.
- [ ] **Step 3:** Rodar `npm run verify`, `node scripts/pack.mjs` e `node scripts/pack-smoke.mjs`. Expected: tudo verde.
- [ ] **Step 4:** Push no `ases/PHASE-18`. O CI tem que dar Windows 3/3 e Linux 3/3, incluindo o `conpty.test.mjs`. Gerar `docs/MATRIZ_SUPORTE.md` do run.
- [ ] **Step 5:** Engine: criar as TAR-0078..0089 na PHASE-18 com `--reqs`. As tarefas vão até REVIEW com `/evidence add`. A evidência é escrita e entregue ao responsável para:
  - aprovar e fazer o merge;
  - publicar a 1.1.0 pelo Terminal (Touch ID);
  - opcionalmente, o smoke real (um turno com claude e com codex como principal, com o consentimento dele).
- [ ] **Step 6:** Commit `"PHASE-18: about, eureka42.org, e2e do chat, docs e 1.1.0 (TAR-0089)"`
