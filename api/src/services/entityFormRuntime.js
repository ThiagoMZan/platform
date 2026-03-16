import { peopleRepo } from "../../../../platform-modules/core-people/api/repositories/peopleRepo.js";
import { audienceTypesRepo } from "../../../../platform-modules/core-people/api/repositories/audienceTypesRepo.js";
import { usersRepo } from "../repositories/usersRepo.js";
import { passwordHistoryRepo } from "../repositories/passwordHistoryRepo.js";
import { rolesRepo } from "../repositories/rolesRepo.js";
import argon2 from "argon2";

function cloneSchema(schema) {
  return JSON.parse(JSON.stringify(schema || {}));
}

function normalizePeoplePayload(data = {}) {
  return {
    document: String(data.document || "").trim(),
    gender: data.gender || null,
    person_type: data.person_type || null,
    audience_type_id: data.audience_type_id || null,
  };
}

function normalizePeopleRecordId(recordId) {
  if (typeof recordId === "number") return recordId;
  if (typeof recordId === "string" && /^\d+$/.test(recordId)) return Number(recordId);
  return recordId;
}

function patchAudienceTypeOptions(schema, options) {
  const nextSchema = cloneSchema(schema);
  if (!Array.isArray(nextSchema.fields)) return nextSchema;

  nextSchema.fields = nextSchema.fields.map((field) => {
    if (field?.key !== "audience_type_id") return field;
    return {
      ...field,
      options,
    };
  });

  return nextSchema;
}

function createPeopleEntityHandler(db) {
  const repoPeople = peopleRepo(db);
  const repoAudienceTypes = audienceTypesRepo(db);

  return {
    async enrichSchema(schema) {
      const audienceTypes = await repoAudienceTypes.list();
      const options = audienceTypes.map((item) => ({
        label: item.description,
        value: item.id,
      }));

      return patchAudienceTypeOptions(schema, options);
    },

    listRecords({ page = 1, pageSize = 20, search = "", sortBy = "id", sortDir = "desc" }) {
      return repoPeople.list({ page, pageSize, search, sortBy, sortDir });
    },

    findRecord(recordId) {
      return repoPeople.findById(normalizePeopleRecordId(recordId));
    },

    async saveRecord({ recordId = null, data }) {
      const payload = normalizePeoplePayload(data);
      const normalizedRecordId = normalizePeopleRecordId(recordId);

      if (!payload.document || payload.document.length < 11 || payload.document.length > 20) {
        const err = new Error("invalid_payload");
        err.code = "invalid_payload";
        throw err;
      }

      if (!["fisica", "juridica"].includes(payload.person_type)) {
        const err = new Error("invalid_payload");
        err.code = "invalid_payload";
        throw err;
      }

      if (payload.gender && !["masculino", "feminino", "outro"].includes(payload.gender)) {
        const err = new Error("invalid_payload");
        err.code = "invalid_payload";
        throw err;
      }

      if (payload.audience_type_id != null) {
        const audienceType = await repoAudienceTypes.findById(payload.audience_type_id);
        if (!audienceType) {
          const err = new Error("audience_type_not_found");
          err.code = "audience_type_not_found";
          throw err;
        }
      }

      if (normalizedRecordId) {
        const found = await repoPeople.findById(normalizedRecordId);
        if (!found) {
          const err = new Error("record_not_found");
          err.code = "record_not_found";
          throw err;
        }

        const existing = await repoPeople.findByDocumentExcludingId(payload.document, normalizedRecordId);
        if (existing) {
          const err = new Error("document_already_exists");
          err.code = "document_already_exists";
          throw err;
        }

        return repoPeople.update(normalizedRecordId, payload);
      }

      const existing = await repoPeople.findByDocument(payload.document);
      if (existing) {
        const err = new Error("document_already_exists");
        err.code = "document_already_exists";
        throw err;
      }

      return repoPeople.create(payload);
    },

    async removeRecord(recordId) {
      const normalizedRecordId = normalizePeopleRecordId(recordId);
      const found = await repoPeople.findById(normalizedRecordId);
      if (!found) {
        const err = new Error("record_not_found");
        err.code = "record_not_found";
        throw err;
      }

      return repoPeople.remove(normalizedRecordId);
    },
  };
}

function normalizeUserPayload(data = {}) {
  return {
    name: String(data.name || "").trim(),
    email: String(data.email || "").trim().toLowerCase(),
    password: data.password ? String(data.password) : "",
    inactive: Boolean(data.inactive),
  };
}

function createUsersEntityHandler(db) {
  const repoUsers = usersRepo(db);

  return {
    listRecords({ page = 1, pageSize = 20, search = "", sortBy = "created_at", sortDir = "desc" }) {
      return repoUsers.list({ page, pageSize, search, sortBy, sortDir });
    },

    findRecord(recordId) {
      return repoUsers.findById(recordId);
    },

    async saveRecord({ recordId = null, data }) {
      const payload = normalizeUserPayload(data);

      if (!payload.name || payload.name.length < 2) {
        const err = new Error("invalid_payload");
        err.code = "invalid_payload";
        throw err;
      }

      if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
        const err = new Error("invalid_payload");
        err.code = "invalid_payload";
        throw err;
      }

      if (recordId) {
        const found = await repoUsers.findById(recordId);
        if (!found) {
          const err = new Error("record_not_found");
          err.code = "record_not_found";
          throw err;
        }

        const existing = await repoUsers.findByEmailExcludingId(payload.email, recordId);
        if (existing) {
          const err = new Error("email_already_exists");
          err.code = "email_already_exists";
          throw err;
        }

        const password_hash = payload.password ? await argon2.hash(payload.password) : undefined;
        return db.transaction(async (trx) => {
          const trxUsersRepo = usersRepo(trx);
          const trxPasswordHistoryRepo = passwordHistoryRepo(trx);
          const updated = await trxUsersRepo.update(recordId, {
            email: payload.email,
            name: payload.name,
            inactive: payload.inactive,
            password_hash,
          });

          if (password_hash) {
            await trxPasswordHistoryRepo.create({
              user_id: recordId,
              password_hash,
            });
          }

          return updated;
        });
      }

      if (!payload.password || payload.password.length < 6) {
        const err = new Error("invalid_payload");
        err.code = "invalid_payload";
        throw err;
      }

      const existing = await repoUsers.findByEmail(payload.email);
      if (existing) {
        const err = new Error("email_already_exists");
        err.code = "email_already_exists";
        throw err;
      }

      return db.transaction(async (trx) => {
        const trxUsersRepo = usersRepo(trx);
        const trxPasswordHistoryRepo = passwordHistoryRepo(trx);
        const password_hash = await argon2.hash(payload.password);
        const created = await trxUsersRepo.create({
          email: payload.email,
          name: payload.name,
          inactive: payload.inactive,
          password_hash,
        });
        await trxPasswordHistoryRepo.create({
          user_id: created.id,
          password_hash,
        });
        return created;
      });
    },

    async removeRecord(recordId) {
      const found = await repoUsers.findById(recordId);
      if (!found) {
        const err = new Error("record_not_found");
        err.code = "record_not_found";
        throw err;
      }

      return repoUsers.remove(recordId);
    },
  };
}

function normalizeRolePayload(data = {}) {
  return {
    key: String(data.key || "").trim(),
    name: String(data.name || "").trim(),
    description: data.description == null ? null : String(data.description).trim() || null,
    inactive: Boolean(data.inactive),
  };
}

function createRolesEntityHandler(db) {
  const repoRoles = rolesRepo(db);

  return {
    async listRecords({ page = 1, pageSize = 20, search = "", sortBy = "name", sortDir = "asc" }) {
      const { items } = await Promise.resolve({ items: await repoRoles.list() });
      const term = String(search || "").trim().toLowerCase();

      let filtered = items;
      if (term) {
        filtered = items.filter((item) =>
          [item.key, item.name, item.description]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(term))
        );
      }

      const sortable = new Set(["key", "name", "inactive", "created_at"]);
      const finalSortBy = sortable.has(sortBy) ? sortBy : "name";
      const finalSortDir = sortDir === "desc" ? "desc" : "asc";
      filtered = filtered.sort((a, b) => {
        const av = a?.[finalSortBy];
        const bv = b?.[finalSortBy];
        if (av == null && bv == null) return 0;
        if (av == null) return finalSortDir === "asc" ? -1 : 1;
        if (bv == null) return finalSortDir === "asc" ? 1 : -1;
        if (av > bv) return finalSortDir === "asc" ? 1 : -1;
        if (av < bv) return finalSortDir === "asc" ? -1 : 1;
        return 0;
      });

      const offset = (page - 1) * pageSize;
      return {
        items: filtered.slice(offset, offset + pageSize),
        total: filtered.length,
      };
    },

    findRecord(recordId) {
      return repoRoles.findById(recordId);
    },

    async saveRecord({ recordId = null, data }) {
      const payload = normalizeRolePayload(data);

      if (!payload.key || payload.key.length < 2 || !payload.name || payload.name.length < 2) {
        const err = new Error("invalid_payload");
        err.code = "invalid_payload";
        throw err;
      }

      if (recordId) {
        const found = await repoRoles.findById(recordId);
        if (!found) {
          const err = new Error("record_not_found");
          err.code = "record_not_found";
          throw err;
        }

        const existing = await repoRoles.findByKeyExcludingId(payload.key, recordId);
        if (existing) {
          const err = new Error("role_key_exists");
          err.code = "role_key_exists";
          throw err;
        }

        return repoRoles.update(recordId, payload);
      }

      const existing = await repoRoles.findByKey(payload.key);
      if (existing) {
        const err = new Error("role_key_exists");
        err.code = "role_key_exists";
        throw err;
      }

      return repoRoles.create(payload);
    },

    async removeRecord(recordId) {
      const found = await repoRoles.findById(recordId);
      if (!found) {
        const err = new Error("record_not_found");
        err.code = "record_not_found";
        throw err;
      }

      return repoRoles.remove(recordId);
    },
  };
}

export function createEntityFormRuntime(db) {
  const handlers = {
    users: createUsersEntityHandler(db),
    roles: createRolesEntityHandler(db),
    people: createPeopleEntityHandler(db),
  };

  return {
    findHandler(entityKey) {
      return handlers[entityKey] || null;
    },
  };
}
