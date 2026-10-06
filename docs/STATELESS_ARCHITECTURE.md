# Stateless Architecture

Este documento registra a direção arquitetural da plataforma para permitir múltiplas instâncias de API e workers sem depender de estado local de uma instância específica.

## Objetivo

A plataforma deve poder evoluir de:

```text
API única
  |
PostgreSQL
```

para:

```text
             Load Balancer
          /       |       \
       API 1     API 2     API N
          \       |       /
             PostgreSQL
                 |
          Worker 1..N
```

sem alterar a lógica dos módulos.

## Regra principal

Uma instância da API não deve ser dona de estado funcional necessário para a continuidade da aplicação.

Estado funcional deve ficar em serviços compartilhados e persistentes.

Exemplos:

- PostgreSQL;
- object storage;
- broker/fila, quando necessário.

Estado local em memória continua permitido quando for:

- efêmero;
- reconstruível;
- apenas otimização;
- isolado à requisição/processamento atual.

## Sessões

Sessões humanas permanecem no PostgreSQL.

```text
Browser
   |
cookie sid
   |
API 1 / API 2 / API N
   |
PostgreSQL.sessions
```

Isso permite que qualquer requisição autenticada seja atendida por qualquer instância.

## Request Context

`AsyncLocalStorage` é apropriado para contexto temporário de execução.

Pode carregar:

- requestId/correlationId;
- userId;
- sessionId;
- apiClientId;
- moduleKey;
- transaction atual.

Esse contexto não representa estado compartilhado e não precisa ir para Redis ou PostgreSQL.

O contexto de módulo também usa `AsyncLocalStorage`, evitando colisão entre jobs concorrentes.

## Hooks

Hooks registrados em memória são aceitáveis quando fazem parte do código carregado deterministicamente em todas as instâncias.

Exemplo:

```text
API 1 -> carrega people.beforeSave
API 2 -> carrega people.beforeSave
API 3 -> carrega people.beforeSave
```

O problema não é o hook estar em memória; o problema é alterar dinamicamente apenas uma instância.

Direção desejada:

- código de módulos presente no build/distribuição;
- hooks carregados no bootstrap;
- ativação funcional separada de carregamento físico de código.

## Módulos

Devemos separar dois conceitos:

```text
código disponível
        !=
módulo habilitado
```

A distribuição define quais módulos existem no build.

Configuração/tenant define quais funcionalidades estão habilitadas.

Ativar ou desativar funcionalidade não deve depender de importar/remover código JS em apenas uma instância.

A implementação atual ainda possui partes dinâmicas de ativação; isso deve ser evoluído gradualmente.

## Jobs

Jobs internos usam Graphile Worker sobre PostgreSQL.

A API apenas enfileira:

```text
API
 |
jobs.add(...)
 |
PostgreSQL / graphile_worker
 |
Worker
```

Workers podem ser escalados horizontalmente.

```text
PostgreSQL
  |      |
Worker1 Worker2
```

A coordenação é feita pelo Graphile Worker.

Quando a criação do job for consequência obrigatória de uma gravação, usar `jobs.addWithDb(...)` dentro da mesma transação Knex.

Assim:

```text
BEGIN
  INSERT dado
  INSERT job
COMMIT
```

ou ambos fazem rollback.

## Schedule x Job

Schedule e Job são conceitos diferentes.

```text
SCHEDULE
  |
  | determina quando
  v
JOB
  |
  | determina o que executar
  v
HANDLER
```

Exemplo:

```text
"todo dia às 02:00"
        |
        v
people.rebuild-index
        |
        v
schedule.register(...)
```

A tela administrativa futura deve refletir essa separação.

### Tela de Agendamentos

Responsável por configuração:

- nome;
- handler;
- cron/timer;
- ativo;
- parâmetros;
- próximo disparo.

### Tela de Execuções

Responsável por observabilidade:

- job;
- handler;
- criado em;
- iniciou em;
- terminou em;
- status;
- tentativas;
- payload;
- erro.

A UI da plataforma não deve administrar diretamente as tabelas internas do Graphile Worker.

Deve existir uma camada de domínio da plataforma entre a tela e a implementação da fila.

Isso permite trocar o mecanismo interno no futuro sem alterar a experiência dos módulos ou do administrador.

## API e Worker

Processos diferentes:

```text
npm run start
npm run worker
```

API:

- HTTP;
- autenticação;
- CRUD;
- enqueue de jobs.

Worker:

- execução de jobs;
- handlers dos módulos;
- retries;
- processamento assíncrono.

## Arquivos

Storage local não é adequado para produção com múltiplas instâncias.

```text
API 1 -> arquivo local A
API 2 -> não possui A
```

Direção:

```text
FilesService
    |
FileStorage
    |
S3 / storage compartilhado
```

Driver local permanece útil para desenvolvimento.

## Cache

Cache em memória pode continuar existindo se não for fonte da verdade.

Permitido:

- dados reconstruíveis;
- TTL curto;
- otimização local.

Não usar cache local para estado que exige invalidação global imediata.

Quando houver necessidade real de cache compartilhado, introduzir provider externo, por exemplo Redis.

A API de cache deve esconder a implementação:

```text
cache.get
cache.set
cache.del
```

## Rate Limit

Rate limit local funciona por instância.

Para limite global, preferir infraestrutura compartilhada, por exemplo:

- Nginx;
- API Gateway;
- Redis-backed store.

Não é necessário adicionar Redis apenas por esse motivo no estágio atual.

## Outbox e eventos

Jobs não substituem eventos de domínio.

Separação desejada:

```text
JOB
= trabalho assíncrono a executar

DOMAIN EVENT
= algo aconteceu

SCHEDULE
= quando criar/executar um job
```

Para eventos que precisam sobreviver a falhas e posteriormente sair para outro sistema/broker, usar Transactional Outbox.

## Mensageria futura

Graphile Worker é a solução para jobs internos.

Ele não precisa resolver todos os problemas assíncronos da plataforma.

Se surgirem necessidades como:

- chat;
- realtime de alto volume;
- fan-out;
- integração entre vários sistemas;
- streaming de eventos;

podemos adicionar outra infraestrutura, como RabbitMQ, Redis Streams ou Kafka, sem substituir o mecanismo de jobs.

```text
PostgreSQL + Graphile Worker
        -> jobs internos

Broker/Event Streaming futuro
        -> realtime / integração / fan-out
```

## Checklist de stateless

### Já adequado

- sessões no PostgreSQL;
- autenticação por API client persistente;
- request context via AsyncLocalStorage;
- audit persistente;
- jobs persistentes no PostgreSQL;
- workers separados da API.

### Ainda precisa evoluir

- ativação dinâmica de módulos;
- files local -> storage compartilhado;
- cache local quando consistência global for necessária;
- rate limit global, se necessário;
- scheduler administrativo adaptado ao Graphile Worker;
- Outbox para eventos duráveis.

## Princípio de evolução

Não adicionar infraestrutura distribuída antes de existir necessidade concreta.

Preferir:

```text
PostgreSQL
+ Fastify
+ Knex
+ Graphile Worker
```

enquanto isso resolver bem o problema.

Adicionar Redis, RabbitMQ, Kafka ou outros serviços apenas quando uma necessidade funcional ou operacional justificar a complexidade.
