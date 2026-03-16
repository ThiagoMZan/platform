export async function requireAuth(req, reply) {
  if (!req.user && !req.apiClient) {
    return reply.code(401).send({ error: "unauthorized" });
  }
}

export function requirePermission(permissionKey) {
  return async function permissionGuard(req, reply) {
    if (!req.user && !req.apiClient) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const permissions = Array.isArray(req.authPermissions)
      ? req.authPermissions
      : Array.isArray(req.user?.permissions)
        ? req.user.permissions
        : Array.isArray(req.apiClient?.permissions)
          ? req.apiClient.permissions
          : [];
    if (permissions.includes("*") || permissions.includes(permissionKey)) {
      return;
    }

    return reply.code(403).send({ error: "forbidden", permission: permissionKey });
  };
}
