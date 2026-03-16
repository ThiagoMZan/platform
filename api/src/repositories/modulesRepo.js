export function modulesRepo(db) {
  async function findModuleVersion({ moduleKey, version }) {
    return db("module_versions as mv")
      .join("modules as m", "m.id", "mv.module_id")
      .where({ "m.key": moduleKey, "mv.version": version })
      .select("mv.id", "mv.module_id", "mv.version")
      .first();
  }

  return {
    async upsertModuleVersion({ key, name, version, baseOrder, manifest, installPath }) {
      const existingModule = await db("modules").where({ key }).first();

      let moduleId = existingModule?.id;
      if (!moduleId) {
        const [createdModule] = await db("modules").insert({ key, name }).returning(["id"]);
        moduleId = createdModule.id;
      } else {
        await db("modules").where({ id: moduleId }).update({ name });
      }

      const existingVersion = await db("module_versions")
        .where({ module_id: moduleId, version })
        .first();

      if (existingVersion) {
        const [updated] = await db("module_versions")
          .where({ id: existingVersion.id })
          .update({
            base_order: baseOrder,
            manifest,
            install_path: installPath,
          })
          .returning(["id", "module_id", "version", "base_order", "manifest", "install_path", "created_at"]);
        return updated;
      }

      const [created] = await db("module_versions")
        .insert({
          module_id: moduleId,
          version,
          base_order: baseOrder,
          manifest,
          install_path: installPath,
        })
        .returning(["id", "module_id", "version", "base_order", "manifest", "install_path", "created_at"]);
      return created;
    },

    listCatalog() {
      return db("module_versions as mv")
        .join("modules as m", "m.id", "mv.module_id")
        .leftJoin("installed_modules as im", "im.module_id", "m.id")
        .select(
          "m.id as module_id",
          "m.key as module_key",
          "m.name as module_name",
          "mv.id as module_version_id",
          "mv.version",
          "mv.base_order",
          "mv.manifest",
          "mv.install_path",
          "mv.created_at",
          db.raw("coalesce(im.enabled, false) as is_enabled"),
          db.raw("case when im.module_version_id = mv.id then true else false end as is_installed_version"),
          db.raw("case when im.module_version_id = mv.id and coalesce(im.enabled, false) = true then true else false end as is_active_version"),
          "im.order_override"
        )
        .orderBy("m.key", "asc")
        .orderBy("mv.created_at", "desc");
    },

    listInstalled() {
      return db("installed_modules as im")
        .join("module_versions as mv", "mv.id", "im.module_version_id")
        .join("modules as m", "m.id", "im.module_id")
        .select(
          "im.id as installed_module_id",
          "im.enabled",
          "im.order_override",
          "im.created_at as installed_at",
          "im.updated_at",
          "m.id as module_id",
          "m.key as module_key",
          "m.name as module_name",
          "mv.id as module_version_id",
          "mv.version",
          "mv.base_order",
          "mv.manifest",
          "mv.install_path"
        )
        .orderBy("m.key", "asc");
    },

    async activateInstalled({ moduleKey, version, orderOverride = null }) {
      const moduleVersion = await findModuleVersion({ moduleKey, version });
      if (!moduleVersion) return null;

      const existing = await db("installed_modules").where({ module_id: moduleVersion.module_id }).first();

      if (existing) {
        const [updated] = await db("installed_modules")
          .where({ id: existing.id })
          .update({
            module_version_id: moduleVersion.id,
            enabled: true,
            order_override: orderOverride,
          })
          .returning("*");
        return updated;
      }

      const [created] = await db("installed_modules")
        .insert({
          module_id: moduleVersion.module_id,
          module_version_id: moduleVersion.id,
          enabled: true,
          order_override: orderOverride,
        })
        .returning("*");
      return created;
    },

    async deactivateInstalled({ moduleKey }) {
      const existing = await db("installed_modules as im")
        .join("modules as m", "m.id", "im.module_id")
        .where({ "m.key": moduleKey })
        .select("im.id")
        .first();
      if (!existing) return null;

      const [updated] = await db("installed_modules")
        .where({ id: existing.id })
        .update({ enabled: false })
        .returning("*");
      return updated || null;
    },

    async uninstallVersion({ moduleKey, version }) {
      const moduleVersion = await findModuleVersion({ moduleKey, version });
      if (!moduleVersion) return { status: "not_found" };

      const installed = await db("installed_modules").where({ module_id: moduleVersion.module_id }).first();
      if (installed?.module_version_id === moduleVersion.id && installed.enabled) {
        return { status: "active" };
      }

      if (installed?.module_version_id === moduleVersion.id) {
        await db("installed_modules").where({ id: installed.id }).del();
      }

      await db("module_versions").where({ id: moduleVersion.id }).del();

      const remaining = await db("module_versions").where({ module_id: moduleVersion.module_id }).first();
      if (!remaining) {
        await db("modules").where({ id: moduleVersion.module_id }).del();
      }

      return { status: "deleted" };
    },

    listActiveInstalledModules() {
      return db("installed_modules as im")
        .join("module_versions as mv", "mv.id", "im.module_version_id")
        .join("modules as m", "m.id", "mv.module_id")
        .where({ "im.enabled": true })
        .select(
          "im.id as installed_module_id",
          "im.order_override",
          "m.key as module_key",
          "m.name as module_name",
          "mv.version",
          "mv.base_order",
          "mv.manifest",
          "mv.install_path"
        );
    },
  };
}
