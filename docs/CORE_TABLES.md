# Core Tables

Dicionario rapido das tabelas do core da plataforma.

Este arquivo lista apenas as tabelas atuais do core, sem detalhar colunas.

## Identidade e acesso

- `users`
- `sessions`
- `roles`
- `role_permissions`
- `user_roles`
- `permissions`
- `user_permissions`
- `auth_login_attempts`
- `auth_logins`
- `user_password_history`
- `api_clients`
- `api_client_permissions`
- `api_client_tokens`
- `api_client_auth_log`
- `audit_log`

## Configuracao

- `core_settings`
- `files`

## Modulos e instalacao

- `modules`
- `module_versions`
- `installed_modules`
- `tenants`
- `tenant_modules`

## Forms e low-code

- `forms`
- `form_extensions`
- `form_versions`
- `form_extension_versions`
- `entity_records`

## Agendamentos

- `schedule.job_handlers`
- `schedule.scheduled_jobs`
- `schedule.scheduled_job_runs`

## Observacoes

- Esta lista cobre apenas o core da plataforma.
- Tabelas criadas por modulos devem ser documentadas no proprio modulo.
- Alguns artefatos de banco existem como funcao/trigger, mas nao entram aqui porque isto e apenas um dicionario de tabelas.
