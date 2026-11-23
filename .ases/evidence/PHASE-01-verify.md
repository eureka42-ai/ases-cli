# PHASE-01 — verificação (2026-11-23T00:08:12Z)

Host: macOS arm64, Node v22.19.0, npm 10.9.3

```text
$ npm ci --dry-run (lockfile)
15 packages are looking for funding
  run `npm fund` for details

$ npm run verify

> ases-engineering-runtime@0.0.0 verify
> npm run lint && npm run typecheck && npm run test


> ases-engineering-runtime@0.0.0 lint
> node scripts/check-boundaries.mjs

boundaries: OK

> ases-engineering-runtime@0.0.0 typecheck
> tsc -p tsconfig.json


> ases-engineering-runtime@0.0.0 test
> vitest run


 RUN  v4.1.12 <repo>


 Test Files  7 passed (7)
      Tests  34 passed (34)
   Start at  21:08:14
   Duration  400ms (transform 237ms, setup 0ms, import 366ms, tests 306ms, environment 0ms)

exit=0 (código real do npm run verify, medido sem pipe)

$ node scripts/ases-dev.mjs init (2ª execução)
nothing to create (.ases/ already initialized)
$ node scripts/ases-dev.mjs verify
history: 7 event(s), 0 problem(s)
$ shasum -a 256 -c MANIFESTO_FONTES_SHA256.txt
fontes/ASES-300_DOCUMENTACAO_INTEGRAL.md: OK
fontes/ASES-500_GPT_ESPECIFICADOR_INTERATIVO_TRABALHO.md: OK
fontes/ASES-500_METODOLOGIA_CONSOLIDADA_PARA_VALIDACAO.md: OK
branding/references/Emblema Tecnológico Eureka42 AI Framework.png: OK
branding/references/Estudo de Marca Eureka42: Quatro Variações.png: OK
```

CI `.github/workflows/ci.yml` (macOS/Windows/Ubuntu): **NOT_RUN** (sem remoto/push).
