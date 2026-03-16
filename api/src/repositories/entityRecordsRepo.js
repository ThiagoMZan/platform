export function entityRecordsRepo(db) {
  return {
    findById(id) {
      return db("entity_records").where({ id }).first();
    },

    listByEntity({ entityKey, tenantId = null, limit = 50, offset = 0 }) {
      return db("entity_records")
        .where({ entity_key: entityKey })
        .where((qb) => {
          if (tenantId) qb.where({ tenant_id: tenantId });
          else qb.whereNull("tenant_id");
        })
        .orderBy("updated_at", "desc")
        .limit(limit)
        .offset(offset);
    },

    async save({ id = null, entityKey, tenantId = null, data }) {
      if (id) {
        const [updated] = await db("entity_records")
          .where({ id })
          .update({ data, tenant_id: tenantId, entity_key: entityKey })
          .returning("*");
        return updated;
      }

      const [created] = await db("entity_records")
        .insert({ entity_key: entityKey, tenant_id: tenantId, data })
        .returning("*");
      return created;
    },

    async remove(id) {
      const [deleted] = await db("entity_records").where({ id }).del().returning("*");
      return deleted || null;
    },
  };
}
