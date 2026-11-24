# Eureka42 · ASES Engineering Runtime (AER)

Dois comandos no mesmo pacote: **`ases`** (console: motor local + TUI) e **`ases-tar`** (monitor read-only em outro terminal).
Licença: CC BY-NC-ND 4.0 (ver `LICENSE`).

> **Versão 1.0.0.** Suportado: macOS Apple Silicon (verificado na máquina do responsável), Windows x64/arm64 e Linux x64/arm64 (CI, incluindo a TUI no ConPTY do Windows). macOS Intel está fora do escopo (CHANGE-0001). Matriz por alvo: `docs/MATRIZ_SUPORTE.md`.

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

## Motor residente (tarefas seguem com o terminal fechado)
```sh
ases daemon start      # sobe o motor em segundo plano (sem admin)
ases                   # neste projeto, vira cliente do motor; /exit sai sem parar as tarefas
ases daemon status     # pid, saúde e caminho do log
ases daemon stop       # para o motor (cancela tarefas em execução, sem deixar processos órfãos)
```
**Sem supervisor do SO nesta versão:** reboot, logoff ou crash do motor não são cobertos. Depois de um desses, rode `ases` e `/resume`.

## Atualizar e voltar atrás (rollback)
- **Atualizar:** `npm install -g @eureka42-ai/aer@<nova>` (ou o `.tgz` da nova versão).
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
