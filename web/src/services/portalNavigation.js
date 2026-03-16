import { sharedIcons, loadPortalModuleMenu } from "./modulesRuntime";
import { hasAdminPortalAccess } from "./adminNavigation";

const staticPortalItems = [
  {
    location: "portal",
    key: "portal-settings",
    label: "Configuracoes",
    to: "/settings",
    icon: sharedIcons.SettingsOutline,
    superUserOnly: true,
  },
];

async function canAccessPortal(auth, item, options = {}) {
  if (item.superUserOnly && !auth.isSuperUser) return false;
  if (item.permission && auth.hasPermission(item.permission)) return true;

  if (item.allow_if_has_visible_admin_menu) {
    return hasAdminPortalAccess(auth, options);
  }

  return !item.permission;
}

export async function loadPortalItems(auth, { force = false } = {}) {
  const runtimeItems = await loadPortalModuleMenu({ force });
  const allItems = [...runtimeItems, ...staticPortalItems];
  const allowed = await Promise.all(allItems.map((item) => canAccessPortal(auth, item, { force })));
  return allItems.filter((_item, index) => allowed[index]);
}

export async function getDefaultPortalPath(auth, { force = false } = {}) {
  const available = await loadPortalItems(auth, { force });
  if (!available.length) return "/403";

  const configuredDefault = available.find((item) => item.default);
  return (configuredDefault || available[0]).to || "/403";
}

export async function findPortalByPath(auth, path, { force = false } = {}) {
  const items = await loadPortalItems(auth, { force });
  return (
    items
      .filter((item) => item.to)
      .filter((item) => path === item.to || path.startsWith(`${item.to}/`))
      .sort((a, b) => (b.to?.length || 0) - (a.to?.length || 0))[0] || null
  );
}
