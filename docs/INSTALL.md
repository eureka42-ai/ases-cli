# Eureka42 · ASES Engineering Runtime (AER)

Dois comandos no mesmo pacote: **`ases`** (console: motor local + TUI) e **`ases-tar`** (monitor read-only em outro terminal).
Licença: CC BY-NC-ND 4.0 (ver `LICENSE`). · eureka42.org · O Eureka42 é uma iniciativa dos Professores Raul el Greco, Giuseppe Favato e Elzo Brito.

> **Versão 1.1.0.** Suportado: macOS Apple Silicon (verificado na máquina do responsável), Windows x64/arm64 e Linux x64/arm64 (CI, incluindo a TUI no ConPTY do Windows). macOS Intel está fora do escopo (CHANGE-0001). Matriz por alvo: `docs/MATRIZ_SUPORTE.md`.

## Requisitos
- Node.js ≥ 22.18 (o AER usa `node:sqlite`).
- Git (worktrees por tarefa).
- Opcional: os clientes oficiais dos providers (Claude Code, Codex, Kimi, OpenCode, Antigravity), já instalados e logados por você. O AER nunca faz login por você.

## Instalar
```sh
npm install -g @eureka42-ai/aer
ases --version && ases-tar --version
```
Sem rede (o pacote é autocontido): no repositório, `node scripts/pack.mjs` gera `.pack/eureka42-ai-aer-<versão>.tgz`, e `npm install -g ./.pack/eureka42-ai-aer-<versão>.tgz` instala.
Funciona igual em bash, zsh e PowerShell. No Windows, o npm cria `ases.cmd`/`ases-tar.cmd` no prefixo global.

## Primeiros passos (1.1.0)
1. Instale e faça login, no próprio programa de cada uma, em pelo menos uma IA: Claude Code, Codex, Kimi, OpenCode ou Antigravity. O AER nunca faz login por você.
2. Numa pasta de projeto, de preferência um repositório Git: `ases init`, depois `ases`.
3. Na primeira vez abre o assistente. Ele mostra as IAs encontradas e pergunta qual será a **principal**, o modo, o limite por IA e o comando de teste. O assistente não usa IA nem gasta cota.
4. **Converse em texto livre.** A principal responde, lê e edita o projeto, e `/desfazer` volta a última edição.
   - **Pedido grande:** vira um **plano**, que o ASES divide entre as outras IAs, em paralelo.
   - **No plano:** `Enter` executa, `e` edita e `n` descarta.
   - **O que a execução inclui:** revisão cruzada, troca automática de IA e testes antes de a tarefa ficar pronta.
5. **Revisar e aceitar:** `/ver 12` mostra o que a tarefa mudou, e `/aceitar` traz o trabalho pronto para o projeto.
6. **Mais comandos:** `/ajuda` (todos) · `/ia codex` (troca a principal) · `/ias` · `/auto` · `/config` · `/sobre` · `ases update` (nova versão).

Na primeira vez que uma IA real vai rodar, o `ases` pede autorização para usar a SUA conta e cota dela.

## Motor residente (tarefas seguem com o terminal fechado)
```sh
ases daemon start      # sobe o motor em segundo plano (sem admin)
ases                   # neste projeto, vira cliente do motor; /exit sai sem parar as tarefas
ases daemon status     # pid, saúde e caminho do log
ases daemon stop       # para o motor (cancela tarefas em execução, sem deixar processos órfãos)
```
**Sem supervisor do SO nesta versão:** reboot, logoff ou crash do motor não são cobertos. Depois de um desses, rode `ases` e `/resume`.

## Atualizar e voltar atrás (rollback)
- **Atualizar:** `ases update` (ou `npm install -g @eureka42-ai/aer@<nova>`, ou o `.tgz` da nova versão). `ases update --check` só mostra se há versão nova.
  - O banco do projeto (`.ases/db/ases.sqlite`) é migrado na primeira abertura, **com backup automático antes** (`.ases/db/ases.sqlite.bak-v<N>-…`).
- **Voltar atrás:** `npm install -g @eureka42-ai/aer@<anterior>` (ou o `.tgz` anterior).
  - Se o banco já foi migrado para um esquema mais novo, a versão antiga recusa abrir (`DB_SCHEMA_TOO_NEW`), em vez de corromper o banco.
  - Para usar a versão antiga, restaure o backup: feche o `ases` e copie o `.bak-v<N>` por cima de `ases.sqlite`.

## Desinstalar
```sh
npm uninstall -g @eureka42-ai/aer
```
- Remove os dois comandos.
- Os projetos (`.ases/` em cada repositório) e as chaves no cofre do sistema (`ases secret`) **não** são apagados. Para tirar uma chave: `ases secret delete <id>` antes de desinstalar.

## Permissões e segurança (resumo)
- **Sem admin:** nada no AER exige privilégio de administrador.
- **IPC local:** socket Unix `0600` em diretório `0700` (macOS/Linux) ou Named Pipe com ACL do usuário (Windows).
- **Providers reais:** só rodam com `/run --consent <ids>`, um por vez por provider. Instalar extensões e rodar testes exige aprovação (`/approval`) vinculada à operação exata.
- **Chaves de API explícitas:** ficam no cofre nativo (Keychain no macOS; Secret Service no Linux). No Windows o cofre está **indisponível** nesta versão, e o AER recusa guardar chave em arquivo.

## Por sistema
| SO | Terminais testados | Observações |
|---|---|---|
| macOS (Apple Silicon) | Terminal.app/zsh, pty | Keychain disponível |
| Linux x64/arm64 | bash, pty | Secret Service só com D-Bus + `secret-tool` |
| Windows x64/arm64 | PowerShell, cmd | Sem SecretStore; Codex instalado via npm (`.cmd`) não roda sem shell (PHASE-15) |

Limitações completas: `docs/PROVIDERS.md`, ADRs em `docs/ADRs/`.
