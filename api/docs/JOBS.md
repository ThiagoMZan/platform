# Jobs

A plataforma usa Graphile Worker para jobs internos persistentes em PostgreSQL.

## Objetivo

Separar o processamento HTTP do trabalho assíncrono e permitir escalar APIs e workers de forma independente.

```text
Load Balancer
  ├─ API 1
  ├─ API 2
  └─ API N
        |
    PostgreSQL
        |
  ├─ Worker 1
  └─ Worker N
```

Nenhuma API é dona de um job. O estado da fila fica no PostgreSQL.

## Registrando um handler

Os módulos continuam usando a facade schedule:

```js
import { schedule } from "#core/moduleApi";

schedule.register("people.rebuild-index", async (payload, ctx) => {
  // executa o trabalho
}, {
  label: "Rebuild people index",
});
```

O arquivo recomendado continua sendo <module>/api/schedule.js.

## Enfileirando

```js
import { jobs } from "#core/moduleApi";

await jobs.add("people.rebuild-index", { personId: "..." });
```

Também é possível informar runAt, maxAttempts, priority, queueName e jobKey.

## Mesma transação do negócio

Quando o job for consequência obrigatória de uma gravação, prefira adicionar o job usando a mesma transação Knex:

```js
import { db, jobs } from "#core/moduleApi";

await db.transaction(async (trx) => {
  const [person] = await trx("people.person")
    .insert(data)
    .returning("*");

  await jobs.addWithDb(
    trx,
    "people.person-created",
    { personId: person.id },
  );
});
```

Nesse caso, dado e job fazem commit ou rollback juntos.

## Execução

API:

```bash
npm run start
```

Worker:

```bash
npm run worker
```

Desenvolvimento:

```bash
npm run dev
npm run dev:worker
```

## Schema do Graphile Worker

O Graphile Worker mantém o próprio schema graphile_worker.*.

Para criar ou atualizar manualmente:

```bash
npm run jobs:migrate
```

O worker também pode migrar automaticamente ao iniciar.

```env
JOBS_AUTO_MIGRATE=true
JOBS_CONCURRENCY=5
JOBS_POLL_INTERVAL_MS=1000
JOBS_MODULE_REFRESH_MS=30000
```

## Múltiplos workers

É seguro executar vários workers. A coordenação e o claim dos jobs são feitos pelo PostgreSQL.

Os handlers dos módulos ativos são sincronizados periodicamente. Se um job chegar antes de o handler estar carregado, o worker força nova sincronização antes de falhar.

## Escopo

Graphile Worker é a solução para jobs internos da plataforma. Ele não pretende substituir um broker ou event streaming para futuros cenários de chat, realtime de alto volume ou integrações complexas. Outra infraestrutura pode coexistir com esta fila quando houver necessidade.
