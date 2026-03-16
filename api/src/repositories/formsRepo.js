export function formsRepo(db) {
  async function nextFormVersion(trx, formKey) {
    const row = await trx("form_versions").where({ form_key: formKey }).max("version as max").first();
    return Number(row?.max || 0) + 1;
  }

  async function nextExtensionVersion(trx, extensionId) {
    const row = await trx("form_extension_versions")
      .where({ extension_id: extensionId })
      .max("version as max")
      .first();
    return Number(row?.max || 0) + 1;
  }

  async function snapshotFormVersion(trx, form, createdBy = null) {
    const version = await nextFormVersion(trx, form.key);
    const [inserted] = await trx("form_versions")
      .insert({
        form_key: form.key,
        version,
        name: form.name,
        entity_key: form.entity_key,
        schema: form.schema,
        permission_read: form.permission_read,
        permission_write: form.permission_write,
        permission_delete: form.permission_delete,
        created_by: createdBy,
      })
      .returning("*");
    return inserted;
  }

  async function snapshotExtensionVersion(trx, extension, createdBy = null) {
    const version = await nextExtensionVersion(trx, extension.id);
    const [inserted] = await trx("form_extension_versions")
      .insert({
        extension_id: extension.id,
        version,
        priority: extension.priority,
        enabled: extension.enabled,
        patches: extension.patches,
        created_by: createdBy,
      })
      .returning("*");
    return inserted;
  }

  return {
    findByKey(key) {
      return db("forms").where({ key }).first();
    },

    listExtensions(formKey, tenantId = null) {
      return db("form_extensions")
        .where({ form_key: formKey, enabled: true })
        .where((qb) => {
          qb.whereNull("tenant_id");
          if (tenantId) qb.orWhere({ tenant_id: tenantId });
        })
        .orderBy("priority", "asc")
        .orderBy("created_at", "asc");
    },

    listExtensionsByFormKey(formKey) {
      return db("form_extensions")
        .where({ form_key: formKey })
        .select("id", "tenant_id", "module_key", "form_key", "priority", "enabled", "created_at", "updated_at")
        .orderBy("priority", "asc")
        .orderBy("created_at", "asc");
    },

    findExtensionById(id) {
      return db("form_extensions").where({ id }).first();
    },

    listFormVersions(formKey, limit = 50) {
      return db("form_versions")
        .where({ form_key: formKey })
        .orderBy("version", "desc")
        .limit(limit);
    },

    listExtensionVersions(extensionId, limit = 50) {
      return db("form_extension_versions")
        .where({ extension_id: extensionId })
        .orderBy("version", "desc")
        .limit(limit);
    },

    async updateFormDefinition(formKey, payload, createdBy = null) {
      return db.transaction(async (trx) => {
        const existing = await trx("forms").where({ key: formKey }).first();
        if (!existing) return null;

        const patch = {
          name: payload.name,
          entity_key: payload.entity_key,
          schema: payload.schema,
          permission_read: payload.permission_read,
          permission_write: payload.permission_write,
          permission_delete: payload.permission_delete,
        };

        const [updated] = await trx("forms").where({ key: formKey }).update(patch).returning("*");
        await snapshotFormVersion(trx, updated, createdBy);
        return updated;
      });
    },

    async rollbackFormVersion(formKey, version, createdBy = null) {
      return db.transaction(async (trx) => {
        const target = await trx("form_versions").where({ form_key: formKey, version }).first();
        if (!target) return null;

        const [updated] = await trx("forms")
          .where({ key: formKey })
          .update({
            name: target.name,
            entity_key: target.entity_key,
            schema: target.schema,
            permission_read: target.permission_read,
            permission_write: target.permission_write,
            permission_delete: target.permission_delete,
          })
          .returning("*");

        if (!updated) return null;

        await snapshotFormVersion(trx, updated, createdBy);
        return updated;
      });
    },

    async createExtension({ tenant_id = null, module_key, form_key, priority = 100, patches, created_by = null }) {
      return db.transaction(async (trx) => {
        const [row] = await trx("form_extensions")
          .insert({ tenant_id, module_key, form_key, priority, patches })
          .returning("*");

        await snapshotExtensionVersion(trx, row, created_by);
        return row;
      });
    },

    async updateExtensionById(id, payload, createdBy = null) {
      return db.transaction(async (trx) => {
        const existing = await trx("form_extensions").where({ id }).first();
        if (!existing) return null;

        const patch = {
          priority: payload.priority,
          enabled: payload.enabled,
          patches: payload.patches,
        };

        const [updated] = await trx("form_extensions").where({ id }).update(patch).returning("*");
        await snapshotExtensionVersion(trx, updated, createdBy);
        return updated;
      });
    },

    async rollbackExtensionVersion(extensionId, version, createdBy = null) {
      return db.transaction(async (trx) => {
        const target = await trx("form_extension_versions")
          .where({ extension_id: extensionId, version })
          .first();
        if (!target) return null;

        const [updated] = await trx("form_extensions")
          .where({ id: extensionId })
          .update({
            priority: target.priority,
            enabled: target.enabled,
            patches: target.patches,
          })
          .returning("*");

        if (!updated) return null;

        await snapshotExtensionVersion(trx, updated, createdBy);
        return updated;
      });
    },
  };
}
