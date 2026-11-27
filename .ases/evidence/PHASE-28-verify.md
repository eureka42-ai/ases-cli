# PHASE-28: verificação da 1.8.0 (27/11/2026)

- **CI run 45997143555:** 8/8. **Local:** `npm run verify`, 489 passed, 8 skipped, rodado de novo depois da troca de versão. `pack-smoke`: 12 ok. O primeiro CI (45996033275) falhou: um teste e2e ainda esperava 1.7.0; corrigido.
- **Checagem e modos:** `update.test.ts`, bloco "atualização automática":
  - modo auto agenda a instalação; modo avisar só avisa;
  - versão em dia não mostra nada; sem rede, fica em silêncio;
  - não consulta a rede quando está off, quando já checou nas últimas 24h ou quando roda do repositório.
- **`/config atualizacao`:** `chat-commands.test.ts`.
- **Pacote 1.8.0 instalado num prefixo temporário,** com `AER_REGISTRY=file://` anunciando a 9.9.9:
  - no modo avisar, aparece o aviso "Nova versão do AER: 9.9.9";
  - `updateCheckedAt` é gravado, e a segunda abertura no mesmo dia não consulta;
  - no modo auto, a instalação roda ao sair. O npm devolve ETARGET, porque a 9.9.9 não existe, e a versão instalada continua 1.8.0.
- **Não verificado:** uma atualização real com sucesso de uma versão publicada para outra mais nova. O caminho de instalação é o mesmo do `/atualizar` (`runUpdate`), testado com um npm falso.
