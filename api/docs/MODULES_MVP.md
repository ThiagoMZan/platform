# Modules MVP

Objetivo atual:

- manter o `core` da plataforma neste repositorio
- permitir modulos externos versionados, inclusive modulos especificos de cliente
- operar por instancia instalada do cliente, sem multi-tenant logico

## Modelo simples

Cada cliente tera:

- ambiente proprio
- banco proprio
- conjunto proprio de modulos instalados

Entao o controle necessario nao e "qual tenant tem qual modulo ativo", e sim:

- quais modulos estao disponiveis nesta instalacao
- qual versao de cada modulo esta ativa nesta instalacao

## Tipos de repositorio

1. `core`
   Produto base da plataforma.
2. `client-module`
   Repositorio separado para customizacao de um cliente ou grupo pequeno de clientes.

## O que um modulo pode fazer

- adicionar itens de menu e telas novas no admin
- adicionar labels, permissoes e recursos de runtime
- carregar migrations e seeds proprios
- alterar forms do core, como `people.edit`
- estender comportamentos de API previstos pelo core

Regra de composicao:

- o core fornece a base
- os modulos ativos entram por cima
- a composicao final e resolvida em runtime

## Versionamento

Cada modulo possui:

- `module_key`
- `version`
- manifesto
- recursos de runtime

Exemplos:

- `core-people@1.3.0`
- `core-admin@1.1.0`
- `people-custom-xyz@1.0.2`

O versionamento e por modulo, nao por tenant.

## Operacoes minimas

Para cada modulo, a instalacao do cliente deve suportar:

1. instalar uma versao
2. ativar uma versao
3. trocar a versao ativa
4. voltar para uma versao anterior
5. desinstalar uma versao inativa

## Fluxo operacional

1. subir o `core`
2. publicar uma versao do modulo externo
3. copiar ou registrar essa versao no ambiente do cliente
4. sincronizar o catalogo local
5. ativar a versao desejada
6. remontar o runtime da instalacao

## Estrutura de arquivos do modulo

Exemplo:

- `module.json`
- `resources/`
- `db/migrations/`
- `db/seeds/`

Ownership:

- schema do modulo fica em `db/migrations`
- dados iniciais do modulo ficam em `db/seeds`
- recursos de runtime ficam em `resources`

No estado atual, o `knexfile` agrega automaticamente migrations e seeds de `modules/*/api/db/...`, entao o fluxo continua sendo `npm run db:migrate` e `npm run db:seed`.

## Endpoints alvo do MVP

Fluxo sugerido:

1. `POST /modules/sync-local`
2. `GET /modules/catalog`
3. `GET /modules/installed`
4. `POST /modules/activate`
5. `POST /modules/deactivate`
6. `POST /modules/uninstall`
7. `GET /modules/runtime`

Observacoes:

- `/modules/sync-local` busca modulos em `modules` por padrao
- no MVP atual, `sync-local` funciona como instalacao de versoes locais no catalogo
- depois, o mesmo fluxo pode aceitar artefatos publicados por repositorios externos
- `runtime` deve considerar apenas os modulos ativos nesta instalacao

## Estrutura minima de persistencia

Conceitualmente, o MVP precisa de tres grupos de dados:

1. `modules`
   Identidade do modulo.
2. `module_versions`
   Historico de versoes disponiveis.
3. `installed_modules`
   Qual versao esta ativa nesta instalacao.

Regra simples:

- uma versao ativa por modulo em cada instalacao
- versoes antigas continuam registradas para rollback
- nao remover modulo ativo sem antes desativar
