export const portalModulesConfig = [
  {
    key: "administrator",
    label: "Administrador",
    path: "/admin",
    default: true,
    requiredPermissionsAny: ["users.read", "roles.read"],
  },
  {
    key: "settings",
    label: "Configuracoes",
    path: "/settings",
    superUserOnly: true,
  },
];

function canAccess(auth, moduleDef) {
  if (moduleDef.superUserOnly && !auth.isSuperUser) return false;
  if (moduleDef.requiredPermissionsAny?.length && !auth.hasAnyPermission(moduleDef.requiredPermissionsAny)) {
    return false;
  }
  return true;
}

export function listAccessiblePortalModules(auth) {
  return portalModulesConfig.filter((moduleDef) => canAccess(auth, moduleDef));
}

export function getDefaultPortalPath(auth) {
  const available = listAccessiblePortalModules(auth);
  if (!available.length) return "/403";

  const configuredDefault = available.find((moduleDef) => moduleDef.default);
  return (configuredDefault || available[0]).path;
}
