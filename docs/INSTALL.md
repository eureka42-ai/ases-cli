# Eureka42 · ASES Engineering Runtime (AER)

Dois comandos no mesmo pacote: **`ases`** (console: motor local + TUI) e **`ases-tar`** (monitor read-only em outro terminal).
Licença: CC BY-NC-ND 4.0 (ver `LICENSE`).

> **Estado:** ALPHA. Testado em macOS Apple Silicon (local e CI), Windows x64/arm64 e Linux x64/arm64 (CI). macOS Intel está fora do escopo (CHANGE-0001). O pacote ainda **não** foi publicado no registro npm; instala-se a partir do `.tgz`.

## Requisitos
- Node.js ≥ 22.18 (o AER usa `node:sqlite`).
- Git (worktrees por tarefa).
- Opcional: os clientes oficiais dos providers (Claude Code, Codex, Kimi, OpenCode, Antigravity), já instalados e logados por você. O AER nunca faz login por você.

## Instalar
```sh
node scripts/pack.mjs                        # no repositório: gera .pack/eureka42-aer-<versão>.tgz
npm install -g ./.pack/eureka42-aer-<versão>.tgz
ases --version && ases-tar --version
```
Funciona igual em bash, zsh e PowerShell. No Windows, o npm cria `ases.cmd`/`ases-tar.cmd` no prefixo global.

## Atualizar e voltar atrás (rollback)
- **Atualizar:** `npm install -g ./eureka42-aer-<nova>.tgz`.
  - O banco do projeto (`.ases/db/ases.sqlite`) é migrado na primeira abertura, **com backup automático antes** (`.ases/db/ases.sqlite.bak-v<N>-…`).
- **Voltar atrás:** reinstale o `.tgz` anterior.
  - Se o banco já foi migrado para um esquema mais novo, a versão antiga recusa abrir (`DB_SCHEMA_TOO_NEW`), em vez de corromper o banco.
  - Para usar a versão antiga, restaure o backup: feche o `ases` e copie o `.bak-v<N>` por cima de `ases.sqlite`.

## Desinstalar
```sh
npm uninstall -g @eureka42/aer
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
