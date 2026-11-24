# PHASE-18: verificação da 1.1.0 (24/11/2026, sessão Claude Code)

**Desenho e plano:**
- spec: `docs/superpowers/specs/2026-11-24-chat-orquestrador-design.md` (aprovado pelo responsável);
- plano: `docs/superpowers/plans/2026-11-24-chat-orquestrador.md`.

**Local (macOS Apple Silicon, Node 22.19.0):**
- `npm run verify`: 383 passed e 8 skipped. Os skipped são os testes só de Windows, incluindo o ConPTY.
- `pack.mjs` e `pack-smoke.mjs` OK com `eureka42-ai-aer-1.1.0.tgz`, incluindo `ases update --check` contra um registro falso local.

**CI:**
- run 45497487198 (`e5e0124`): Windows 3/3 e Linux 3/3. O chat completo no ConPTY passou em windows-latest (Node 22 e 24) e windows-11-arm (`conpty.test.mjs`, 4 testes). macOS NOT_RUN (cancelado na fila).
- run 45507764866 (`3e48a93`, com as correções da revisão): ver o resultado abaixo.

**Revisão final:** feita por um revisor independente (modelo Opus), que leu o branch inteiro. Veredito inicial: NÃO pronto. Foram 1 crítico e 7 importantes (contando o I2b), todos corrigidos, cada um com um teste que falha sem a correção:
- **C1:** consentimento e comando de teste vindos do `CONFIG.json` versionado não valem como autorização.
- **I1:** caminhos protegidos são normalizados antes da checagem (`./.git`, `a/../.git`, `.GIT`).
- **I2:** o plano usa `Ctrl+E`/`Ctrl+N`, e as teclas `n`/`e` começam mensagens normais.
- **I2b:** a revisão cruzada não ocupa a principal quando há outra IA livre.
- **I3:** `/parar` e a saída do `ases` interrompem o turno da principal.
- **I4:** a mensagem do usuário nunca se perde no orçamento do prompt, e um corte aparece marcado.
- **I5:** `/aceitar` pode ser repetido depois de uma recusa.
- **I6:** quando o provider quebra no meio, a edição ainda ganha ponto de restauração.

Os achados menores ficaram anotados para depois, no ledger.

| TAR | Entrega | Evidência principal |
|---|---|---|
| 0078 | Banner EUREKA42 verde, tema `green`, `/sobre`, eureka42.org | `branding.test.ts`, `tui-shared.test.tsx`, `bins.test.mjs` (`about`) |
| 0079 | Config `chat` por camadas | `project-store.test.ts` "chat config" |
| 0080 | Eventos, migração 5 e store da conversa (texto redigido) | `persistence/test/chat.test.ts`, `migrations.test.ts` "migration 5" |
| 0081 | Simulador de chat e simuladores extras | `simulator.test.ts`, `engine-simulators.test.ts` |
| 0082 | Parser `aer-plan` e atribuição explicada, sem dar tarefas à principal | `chat-plan.test.ts` |
| 0083 | Ponto de restauração e `/desfazer` (index, HEAD e branch intocados; recusa quando o usuário editou depois) | `git-bridge.test.ts` "restore points" |
| 0084 | Turno da principal com fila, consentimento e caminhos protegidos | `scheduler/test/chat.test.ts` |
| 0085 | Plano em paralelo: testes (até 2 refações), troca automática (até 2), revisão cruzada, resumo | `chat-run.test.ts` |
| 0086 | Comandos simples em português e aliases; `/aceitar` com merge | `chat-commands.test.ts`, `chat-review-fixes.test.ts` |
| 0087 | TUI do chat, menu `/`, plano, autorização, fila e assistente | `tui-chat.test.tsx`, `pty.test.mjs` (chat num TTY real), `conpty.test.mjs` |
| 0088 | `ases update` e `/atualizar` | `update.test.ts`, `pack-smoke` |
| 0089 | e2e do chat com processos reais, docs e notas | `test/e2e/chat.test.mjs`, `docs/RELEASE_NOTES.md`, `docs/INSTALL.md` |

**Não verificado:**
- O chat com IAs reais (Claude, Codex…): todos os testes usam o simulador. O smoke real fica para o responsável, com o consentimento dele.
- Se os CLIs reais bloqueiam a escrita em `.git` antes de o AER detectar.
