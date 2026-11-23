# AER — Plano de compatibilidade com três sistemas operacionais

**Escopo confirmado:** CLI/TUI nativo em macOS, Windows e Linux. **Sem web, Electron, navegador, dashboard em nuvem ou componentes UI externos.** A primeira implementação ocorre no macOS, mas a arquitetura e gates de lançamento são multiplataforma desde o começo. Os estados nesta especificação são **PROPOSED / NOT_TESTED** até execução real.

## Matriz de destino

| Alvo | Terminais principais | IPC | SecretStore | Background | Condição de suporte |
|---|---|---|---|---|---|
| macOS arm64 (Apple Silicon) | Terminal.app, iTerm2, Ghostty | Unix Domain Socket | Keychain | launchd se habilitado | E2E real e release gate |
| Windows x64 | Windows Terminal, PowerShell | Named Pipes com ACL | Credential Manager / DPAPI | usuário/sessão, sem admin obrigatório | E2E real e release gate |
| Linux x64 | terminal UTF-8 bash/zsh | Unix Domain Socket | Secret Service/libsecret, se existir | systemd --user, se existir | E2E real e release gate |
| Windows arm64, Linux arm64 | conforme ambiente comprovado | conforme SO | conforme SO | conforme SO | opcional, NOT_RUN até validado |
| ~~macOS x64 (Intel)~~ | — | — | — | — | **fora do escopo (CHANGE-0001, 22/11/2026)**: o AER recusa iniciar e o `doctor` informa |

## Critérios operacionais

1. `core` e `provider-sdk` não podem importar pacotes exclusivos de um SO; interfaces `PlatformAdapter`, `LocalIpcTransport`, `SecretStore`, `ProcessSupervisor`, `TerminalCapabilities` abstraem comportamento.
2. Não criar HTTP local como substituto de Named Pipes por conveniência sem ADR e avaliação de risco; nunca servidor público.
3. `npm pack` gera único pacote com `bin` de `ases` e `ases-tar`, `engines` e lista exata de arquivos; scripts Node funcionam em PowerShell, zsh e bash.
4. `ases init` suporta caminhos com espaços/acentos, letra de drive, UNC, symlinks/junctions e ACL/umask.
5. Diferenciar teste unitário simulado e teste E2E real do SO. `NOT_RUN` jamais significa `PASS`.
6. Secrets: preferir autenticação dos CLIs oficiais. Se SecretStore nativo inexistente, não persistir API key em texto puro.
7. SQLite: usar driver compatível com todos os OS e arquiteturas anunciados; testar migração, transações e recuperação com subprocessos reais.
8. Cancelamento de agentes precisa terminar corretamente a árvore de subprocessos por sistema; não usar shell string interpolation.
9. Matriz de CI macOS / Windows / Ubuntu + ambientes complementares quando disponíveis; registrar Node LTS, kernel/SO e arquitetura.
10. Lançamento público que se intitule multiplataforma exige gates por OS; alpha macOS pode sair antes com descrição limitada.

## Comandos de aceitação planejados (não executados neste kit)

```text
node --version
npm --version
npm pack --dry-run
ases --version
ases-tar --version
ases doctor
ases --no-banner --no-color --help
ases-tar --no-color --help
```

Executar teste com `NO_COLOR=1` usando a sintaxe correta do shell de cada SO; `TERM=dumb` quando existir; `--json` deve entregar stdout somente JSON.
