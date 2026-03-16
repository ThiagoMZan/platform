# Low-code Core MVP

Endpoints unicos:

- `GET /forms/:formKey/render`
- `GET /forms/:formKey/records`
- `POST /forms/:formKey/save`
- `POST /forms/:formKey/delete`
- `POST /forms/:formKey/action/:actionKey`
- `POST /forms/extensions`

Escopo atual:

- o form base pertence ao core
- customizacoes ficam em modulos externos versionados
- cada instalacao de cliente tem seu proprio banco e seu proprio conjunto de modulos ativos

Patch ops suportados:

- `set` (inclui alias `fields.<key>.<prop>`)
- `unset`
- `insert_after`
- `remove`
- `append_hook`

Exemplo patch (campo obrigatorio):

```json
{
  "module_key": "people-custom-acme",
  "form_key": "people.edit",
  "priority": 300,
  "patches": [
    { "op": "set", "path": "fields.document.required", "value": true }
  ]
}
```

## Como pensar as customizacoes

O core define o form original, por exemplo `people.edit`.

Um modulo externo pode registrar uma `extension` para esse form usando:

- `module_key`
- `form_key`
- `priority`
- `patches`

Com isso, a customizacao fica fora do core, mas consegue:

- alterar campos
- mudar obrigatoriedade
- inserir ou remover blocos
- anexar hooks previstos pelo motor

## Versionamento que importa aqui

Ha dois niveis de controle diferentes:

1. versao do modulo
   Exemplo: `people-custom-acme@1.0.0`
2. historico da extension ou do form
   Usado para diff, auditoria e rollback operacional

A tela de versionamento atual atende o segundo caso:

- historico do form base
- historico das extensions aplicadas
- comparacao entre snapshots
- rollback de estado

Ela nao substitui o controle de versao do modulo instalado.

## Regra operacional

- instalar ou ativar um modulo define quais customizacoes entram no runtime
- alterar uma extension gera novo snapshot para auditoria
- rollback de extension volta o estado daquele ajuste
- rollback de modulo troca a versao ativa do modulo na instalacao
