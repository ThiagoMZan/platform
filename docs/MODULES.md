# Modules

Contrato atual de modulos da plataforma.

Este documento descreve:

- onde os modulos ficam
- o que a plataforma carrega automaticamente
- como estruturar backend e frontend
- como sincronizar e ativar modulos

## Localizacao

No layout atual, a base esta separada assim:

```txt
platform-core/
platform-modules/
platform-projects/
```

Todos os modulos compartilhados e custom ficam em:

```txt
platform-modules/<module-key>/
```

Exemplos reais:

- `platform-modules/core-admin`
- `platform-modules/core-people`
- `platform-modules/people-custom-acme`

## Estrutura do modulo

Estrutura recomendada:

```txt
platform-modules/
  meu-modulo/
    module.json
    api/
      routes.js
      repositories/
      services/
      handlers/
      hooks.js
      validators/
      menu.json
      permissions.json
      forms/
      labels/
      sources/
      db/
        migrations/
        seeds/
    web/
      admin.js
      pages/
      components/
      services/
```

Nem todas as pastas sao obrigatorias.

## module.json

Arquivo obrigatorio na raiz do modulo.

Exemplo:

```json
{
  "id": "people-custom-acme",
  "name": "People Custom ACME",
  "version": "1.0.0",
  "order": 300,
  "dependencies": {
    "core-people": "^1.0.0"
  },
  "apiDependencies": {
    "xml2js": "^0.6.2"
  },
  "webDependencies": {
    "dayjs": "^1.11.13"
  }
}
```

## Runtime carregado automaticamente

Arquivos lidos do `api/` do modulo:

- `menu.json`
- `permissions.json`
- `labels/*.json`
- `forms/*.json`
- `sources/*.json`

Esses arquivos entram no runtime do modulo via `GET /modules/runtime`.

## Hooks programaveis

Os modulos podem registrar hooks em:

- `api/hooks.js`

Exemplo:

```js
import { hooks } from "#core/moduleApi";

async function normalizePeopleEditSegment(ctx) {
  if (!ctx?.data?.segment) return;
  ctx.data.segment = String(ctx.data.segment).trim().toUpperCase();
}

hooks.on("forms.people.edit.before-save", normalizePeopleEditSegment);
```

Eventos de forms suportados:

- `forms.before-render`
- `forms.after-render`
- `forms.before-save`
- `forms.after-save`
- `forms.before-delete`
- `forms.after-delete`

E tambem a variante por form:

- `forms.<formKey>.before-render`
- `forms.<formKey>.after-render`
- `forms.<formKey>.before-save`
- `forms.<formKey>.after-save`
- `forms.<formKey>.before-delete`
- `forms.<formKey>.after-delete`

Exemplo:

- listener declarado em `platform-modules/people-custom-acme/api/hooks.js`

## Schedule / Jobs

Os modulos podem registrar handlers de job em:

- `api/schedule.js`

Exemplo:

```js
import { schedule, jobs } from "#core/moduleApi";

schedule.register("people-custom-acme.example-job", async (payload) => {
  return { ok: true, payload };
});

await jobs.add("people-custom-acme.example-job", {
  personId: "..."
});
```

A API apenas enfileira. A execucao ocorre em um processo worker separado usando Graphile Worker e PostgreSQL. Isso permite executar varias instancias de API e worker sem que uma instancia especifica seja dona do job.

Para operacoes em que a gravacao e o job precisam ser atomicos, use `jobs.addWithDb(trx, ...)` dentro da mesma transacao Knex.

Mais detalhes em `api/docs/JOBS.md`.

## Facade publico do core

Os modulos podem importar do facade publico:

```js
import { hooks, http, logging, i18n, db, schedule, jobs, files } from "#core/moduleApi";
```

Recursos expostos hoje:

- `hooks`
- `http`
- `logging`
- `i18n`
- `db`
- `schedule`
- `jobs`
- `files`

## Frontend de modulo

Os modulos podem registrar paginas administrativas em:

- `web/admin.js`

Registro atual central:

- `platform-core/web/src/modules/registry.js`

Exemplo:

- `platform-modules/people-custom-acme/web/admin.js`

## Banco por modulo

Convencao atual:

- migrations em `platform-modules/*/api/db/migrations`
- seeds em `platform-modules/*/api/db/seeds`

O `knexfile` do core agrega essas pastas automaticamente.

Fluxo:

1. editar ou criar modulo em `platform-modules/`
2. `npm run db:migrate`
3. `npm run db:seed` se precisar
4. `POST /modules/sync-local`
5. ativar o modulo

## Modulos e ativacao

Endpoints relevantes:

- `POST /modules/sync-local`
- `GET /modules/catalog`
- `GET /modules/installed`
- `POST /modules/activate`
- `POST /modules/deactivate`
- `GET /modules/runtime`

O `sync-local` varre os manifests em `platform-modules/*/module.json`.

## Observacoes

- Os caminhos antigos em `api/modules` e `web/src/modules/<modulo>` nao fazem parte da convencao oficial.
- `platform-projects/` representa os projetos orquestradores por cliente ou ambiente.
