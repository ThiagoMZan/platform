import { loadAdminModuleMenu, flattenMenu } from "./modulesRuntime";

function filterMenuByPermission(options, auth) {
  const output = [];

  for (const option of options) {
    if (option.permission && !auth.hasPermission(option.permission)) continue;

    if (option.children?.length) {
      const children = filterMenuByPermission(option.children, auth);
      if (!children.length && !option.to) continue;
      output.push({ ...option, children });
      continue;
    }

    output.push(option);
  }

  return output;
}

export async function getDefaultAdminPath(auth, { force = false } = {}) {
  const menu = await loadAdminModuleMenu({ force });
  const filtered = filterMenuByPermission(menu, auth);
  const firstItem = flattenMenu(filtered)
    .map(({ option }) => option)
    .find((item) => item.to);

  return firstItem?.to || "/403";
}

export async function hasVisibleAdminMenuAccess(auth, { force = false } = {}) {
  const menu = await loadAdminModuleMenu({ force });
  const filtered = filterMenuByPermission(menu, auth);
  return flattenMenu(filtered).some(({ option }) => !!option.to);
}

export async function hasAdminPortalAccess(auth, { force = false } = {}) {
  if (auth.hasPermission("admin.access")) return true;
  return hasVisibleAdminMenuAccess(auth, { force });
}
