function clone(input) {
  return JSON.parse(JSON.stringify(input));
}

function getPathSegments(path) {
  return path.split(".").filter(Boolean);
}

function setByPath(target, path, value) {
  const parts = getPathSegments(path);
  let current = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (current[key] == null || typeof current[key] !== "object") current[key] = {};
    current = current[key];
  }
  current[parts[parts.length - 1]] = value;
}

function unsetByPath(target, path) {
  const parts = getPathSegments(path);
  let current = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!current[key] || typeof current[key] !== "object") return;
    current = current[key];
  }
  delete current[parts[parts.length - 1]];
}

function getByPath(target, path) {
  const parts = getPathSegments(path);
  let current = target;
  for (const key of parts) {
    if (current == null) return undefined;
    current = current[key];
  }
  return current;
}

function fieldPatchTarget(schema, path) {
  const parts = getPathSegments(path);
  if (parts[0] !== "fields" || parts.length < 3) return null;
  const fieldKey = parts[1];
  const field = (schema.fields || []).find((f) => f?.key === fieldKey);
  if (!field) return null;
  return { field, innerPath: parts.slice(2).join(".") };
}

function setWithFieldAlias(schema, path, value) {
  const aliased = fieldPatchTarget(schema, path);
  if (!aliased) {
    setByPath(schema, path, value);
    return;
  }
  setByPath(aliased.field, aliased.innerPath, value);
}

function unsetWithFieldAlias(schema, path) {
  const aliased = fieldPatchTarget(schema, path);
  if (!aliased) {
    unsetByPath(schema, path);
    return;
  }
  unsetByPath(aliased.field, aliased.innerPath);
}

function insertAfterField(schema, targetKey, field) {
  const fields = schema?.fields;
  if (!Array.isArray(fields)) return;
  const index = fields.findIndex((f) => f?.key === targetKey);
  if (index === -1) {
    fields.push(field);
    return;
  }
  fields.splice(index + 1, 0, field);
}

function removeField(schema, targetKey) {
  const fields = schema?.fields;
  if (!Array.isArray(fields)) return;
  const index = fields.findIndex((f) => f?.key === targetKey);
  if (index !== -1) fields.splice(index, 1);
}

export function applyPatches(baseSchema, patches = []) {
  const schema = clone(baseSchema);

  for (const patch of patches) {
    const op = patch?.op;
    if (op === "set") {
      setWithFieldAlias(schema, patch.path, patch.value);
      continue;
    }
    if (op === "unset") {
      unsetWithFieldAlias(schema, patch.path);
      continue;
    }
    if (op === "insert_after") {
      insertAfterField(schema, patch.target_key, patch.field);
      continue;
    }
    if (op === "remove") {
      removeField(schema, patch.target_key);
      continue;
    }
    if (op === "append_hook") {
      const list = getByPath(schema, patch.path);
      if (Array.isArray(list)) list.push(patch.value);
      else setByPath(schema, patch.path, [patch.value]);
    }
  }

  return schema;
}
