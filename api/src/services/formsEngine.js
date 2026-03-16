import { formsRepo } from "../repositories/formsRepo.js";
import { permissionsRepo } from "../repositories/permissionsRepo.js";
import { entityRecordsRepo } from "../repositories/entityRecordsRepo.js";
import { applyPatches } from "./patchService.js";
import { runHooks } from "./hookService.js";
import { createEntityFormRuntime } from "./entityFormRuntime.js";

function parseJson(value) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value || {};
}

function validateRequiredFields(schema, data) {
  const fields = schema?.fields || [];
  const missing = fields
    .filter((field) => field.required)
    .filter((field) => data[field.key] == null || data[field.key] === "")
    .map((field) => field.key);

  if (missing.length) {
    const err = new Error(`required_fields_missing:${missing.join(",")}`);
    err.code = "required_fields_missing";
    throw err;
  }
}

function hasPermission(repoPerms, permissions, key) {
  if (!key) return true;

  const candidates = [key];
  const formsMatch = key.match(/^forms\.([^.]+)\.(read|write|delete)$/);
  if (formsMatch) {
    candidates.push(`${formsMatch[1]}.${formsMatch[2]}`);
  }

  const fieldMatch = key.match(/^forms\.([^.]+)\.[^.]+\.(read|write|delete)$/);
  if (fieldMatch) {
    candidates.push(`${fieldMatch[1]}.${fieldMatch[2]}`);
  }

  return candidates.some((candidate) => repoPerms.userHasPermissionInList(permissions, candidate));
}

function isFieldAllowed(repoPerms, permissions, field) {
  if (!field || typeof field !== "object") return false;
  return hasPermission(repoPerms, permissions, field.permission_key);
}

function filterSchemaByPermission(repoPerms, permissions, schema) {
  if (!schema) return schema;

  const cloned = JSON.parse(JSON.stringify(schema));
  let allowedFieldKeys = null;

  if (Array.isArray(cloned.fields)) {
    cloned.fields = cloned.fields.filter((field) => isFieldAllowed(repoPerms, permissions, field));
    allowedFieldKeys = new Set(cloned.fields.map((field) => field?.key).filter(Boolean));
  }

  if (Array.isArray(cloned.sections)) {
    cloned.sections = cloned.sections
      .filter((section) => hasPermission(repoPerms, permissions, section?.permission_key))
      .map((section) => {
        if (!Array.isArray(section.fields)) return section;

        const filteredSectionFields = section.fields.filter((item) => {
          if (typeof item === "string") {
            if (!allowedFieldKeys) return true;
            return allowedFieldKeys.has(item);
          }

          if (!item || typeof item !== "object") return false;
          if (!hasPermission(repoPerms, permissions, item.permission_key)) return false;

          if (allowedFieldKeys && item.key) {
            return allowedFieldKeys.has(item.key);
          }

          return true;
        });

        return {
          ...section,
          fields: filteredSectionFields,
        };
      })
      .filter((section) => {
        if (!Array.isArray(section.fields)) return true;
        if (section.keep_if_empty === true) return true;
        return section.fields.length > 0;
      });
  }

  return cloned;
}

function buildFormEventNames(formKey, stage) {
  const normalizedFormKey = String(formKey || "").trim();
  if (!normalizedFormKey) return [`forms.${stage}`];

  return [
    `forms.${stage}`,
    `forms.${normalizedFormKey}.${stage}`,
  ];
}

export function formsEngine(db, { hookBus } = {}) {
  const repoForms = formsRepo(db);
  const repoPerms = permissionsRepo(db);
  const repoRecords = entityRecordsRepo(db);
  const entityRuntime = createEntityFormRuntime(db);

  const safeHookBus = hookBus || {
    trigger: async () => {},
  };

  return {
    async ensurePermission({ userId, permissionKey }) {
      const ok = await repoPerms.userHasPermission(userId, permissionKey);
      if (!ok) {
        const err = new Error("forbidden");
        err.code = "forbidden";
        throw err;
      }
    },

    async render({ formKey, userId, tenantId = null, context = {} }) {
      const form = await repoForms.findByKey(formKey);
      if (!form) {
        const err = new Error("form_not_found");
        err.code = "form_not_found";
        throw err;
      }

      const effectivePermissions = await repoPerms.listEffectiveByUserId(userId);

      if (!hasPermission(repoPerms, effectivePermissions, form.permission_read)) {
        const err = new Error("forbidden");
        err.code = "forbidden";
        throw err;
      }

      const schema = parseJson(form.schema);
      const extensions = await repoForms.listExtensions(formKey, tenantId);
      const merged = extensions.reduce((acc, ext) => applyPatches(acc, parseJson(ext.patches)), schema);

      const renderPermissionKey = merged?.permission_key;
      if (renderPermissionKey && !hasPermission(repoPerms, effectivePermissions, renderPermissionKey)) {
        const err = new Error("forbidden");
        err.code = "forbidden";
        throw err;
      }

      const hookCtx = { formKey, tenantId, context, schema: merged, permissions: effectivePermissions };
      await runHooks({
        names: merged?.hooks?.beforeRender || [],
        ctx: hookCtx,
        hookBus: safeHookBus,
        eventNames: buildFormEventNames(formKey, "before-render"),
      });
      await runHooks({
        names: merged?.hooks?.afterRender || [],
        ctx: hookCtx,
        hookBus: safeHookBus,
        eventNames: buildFormEventNames(formKey, "after-render"),
      });

      const entityHandler = entityRuntime.findHandler(form.entity_key);
      const schemaWithEntity = entityHandler?.enrichSchema
        ? await entityHandler.enrichSchema(hookCtx.schema, { userId, tenantId, context })
        : hookCtx.schema;

      const finalSchema = filterSchemaByPermission(repoPerms, effectivePermissions, schemaWithEntity);

      return {
        form_key: form.key,
        name: form.name,
        entity_key: form.entity_key,
        permissions: {
          read: form.permission_read,
          write: form.permission_write,
          delete: form.permission_delete,
        },
        schema: finalSchema,
      };
    },

    async save({ formKey, userId, tenantId = null, recordId = null, data = {}, context = {} }) {
      const rendered = await this.render({ formKey, userId, tenantId, context });
      await this.ensurePermission({ userId, permissionKey: rendered.permissions.write });

      const payload = { ...(data || {}) };
      const hookCtx = {
        formKey,
        tenantId,
        context,
        data: payload,
        schema: rendered.schema,
        recordId,
        userId,
        db,
      };

      await runHooks({
        names: rendered.schema?.hooks?.beforeSave || [],
        ctx: hookCtx,
        hookBus: safeHookBus,
        eventNames: buildFormEventNames(formKey, "before-save"),
      });
      validateRequiredFields(rendered.schema, hookCtx.data);

      const entityHandler = entityRuntime.findHandler(rendered.entity_key);
      const record = entityHandler?.saveRecord
        ? await entityHandler.saveRecord({
            userId,
            tenantId,
            recordId,
            data: hookCtx.data,
            context,
            schema: rendered.schema,
          })
        : await repoRecords.save({
            id: recordId,
            entityKey: rendered.entity_key,
            tenantId,
            data: hookCtx.data,
          });

      hookCtx.record = record;
      await runHooks({
        names: rendered.schema?.hooks?.afterSave || [],
        ctx: hookCtx,
        hookBus: safeHookBus,
        eventNames: buildFormEventNames(formKey, "after-save"),
      });
      return record;
    },

    async remove({ formKey, userId, tenantId = null, recordId, context = {} }) {
      const rendered = await this.render({ formKey, userId, tenantId, context });
      await this.ensurePermission({ userId, permissionKey: rendered.permissions.delete });

      const hookCtx = {
        formKey,
        tenantId,
        context,
        recordId,
        schema: rendered.schema,
        userId,
        db,
      };

      await runHooks({
        names: rendered.schema?.hooks?.beforeDelete || [],
        ctx: hookCtx,
        hookBus: safeHookBus,
        eventNames: buildFormEventNames(formKey, "before-delete"),
      });
      const entityHandler = entityRuntime.findHandler(rendered.entity_key);
      const deleted = entityHandler?.removeRecord
        ? await entityHandler.removeRecord(recordId, {
            userId,
            tenantId,
            context,
            schema: rendered.schema,
          })
        : await repoRecords.remove(recordId);
      hookCtx.record = deleted;
      await runHooks({
        names: rendered.schema?.hooks?.afterDelete || [],
        ctx: hookCtx,
        hookBus: safeHookBus,
        eventNames: buildFormEventNames(formKey, "after-delete"),
      });
      return deleted;
    },

    async action({ formKey, userId, tenantId = null, actionKey, payload = {}, context = {} }) {
      const rendered = await this.render({ formKey, userId, tenantId, context });
      await this.ensurePermission({ userId, permissionKey: rendered.permissions.write });

      return {
        ok: true,
        form_key: formKey,
        action_key: actionKey,
        tenant_id: tenantId,
        payload,
      };
    },

    listRecords({ entityKey, tenantId = null, limit = 50, offset = 0, page = 1, pageSize = 20, search = "", sortBy = "id", sortDir = "desc" }) {
      const entityHandler = entityRuntime.findHandler(entityKey);
      if (entityHandler?.listRecords) {
        return entityHandler.listRecords({
          tenantId,
          limit,
          offset,
          page,
          pageSize,
          search,
          sortBy,
          sortDir,
        });
      }

      return repoRecords.listByEntity({ entityKey, tenantId, limit, offset });
    },

    async findRecord({ formKey, userId, tenantId = null, recordId, context = {} }) {
      const rendered = await this.render({ formKey, userId, tenantId, context });
      const entityHandler = entityRuntime.findHandler(rendered.entity_key);

      if (entityHandler?.findRecord) {
        const record = await entityHandler.findRecord(recordId, {
          userId,
          tenantId,
          context,
          schema: rendered.schema,
        });
        if (!record) {
          const err = new Error("record_not_found");
          err.code = "record_not_found";
          throw err;
        }
        return record;
      }

      const record = await repoRecords.findById(recordId);
      if (!record) {
        const err = new Error("record_not_found");
        err.code = "record_not_found";
        throw err;
      }

      return record;
    },

    createExtension(payload) {
      return repoForms.createExtension(payload);
    },

    updateFormDefinition(formKey, payload, userId = null) {
      return repoForms.updateFormDefinition(formKey, payload, userId);
    },

    listFormVersions(formKey, limit = 50) {
      return repoForms.listFormVersions(formKey, limit);
    },

    rollbackFormVersion(formKey, version, userId = null) {
      return repoForms.rollbackFormVersion(formKey, version, userId);
    },

    listExtensionsByFormKey(formKey) {
      return repoForms.listExtensionsByFormKey(formKey);
    },

    findExtensionById(id) {
      return repoForms.findExtensionById(id);
    },

    updateExtensionById(id, payload, userId = null) {
      return repoForms.updateExtensionById(id, payload, userId);
    },

    listExtensionVersions(extensionId, limit = 50) {
      return repoForms.listExtensionVersions(extensionId, limit);
    },

    rollbackExtensionVersion(extensionId, version, userId = null) {
      return repoForms.rollbackExtensionVersion(extensionId, version, userId);
    },
  };
}


