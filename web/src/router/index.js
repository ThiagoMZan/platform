import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { getRegisteredAdminRoutes } from "../modules/registry";
import { isModuleActive, loadModulesRuntime } from "../services/modulesRuntime";
import { hasAdminPortalAccess } from "../services/adminNavigation";

const LoginPage = () => import("../pages/auth/LoginPage.vue");
const UnauthorizedPage = () => import("../pages/system/UnauthorizedPage.vue");
const ForbiddenPage = () => import("../pages/system/ForbiddenPage.vue");
const HomeRedirectPage = () => import("../pages/system/HomeRedirectPage.vue");
const AdminRedirectPage = () => import("../pages/system/AdminRedirectPage.vue");

const ShellLayout = () => import("../layouts/ShellLayout.vue");
const AdminModuleLayout = () => import("../layouts/AdminModuleLayout.vue");
const SettingsModuleLayout = () => import("../layouts/SettingsModuleLayout.vue");

const SettingsPage = () => import("../pages/settings/SettingsPage.vue");
const ModulesSettingsPage = () => import("../pages/settings/ModulesSettingsPage.vue");
const ApiClientsSettingsPage = () => import("../pages/settings/ApiClientsSettingsPage.vue");
const PermissionsSettingsPage = () => import("../pages/settings/PermissionsSettingsPage.vue");
const SessionsSettingsPage = () => import("../pages/settings/SessionsSettingsPage.vue");
const FormVersioningPage = () => import("../pages/settings/FormVersioningPage.vue");
const registeredAdminRoutes = getRegisteredAdminRoutes();

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "login", component: LoginPage },
    { path: "/401", name: "unauthorized", component: UnauthorizedPage },
    { path: "/403", name: "forbidden", component: ForbiddenPage },
    {
      path: "/",
      component: ShellLayout,
      children: [
        { path: "", redirect: "/home" },
        { path: "home", name: "home", component: HomeRedirectPage },
        {
          path: "admin",
          component: AdminModuleLayout,
          meta: { moduleKey: "core-admin" },
          children: [
            { path: "", name: "admin.home", component: AdminRedirectPage },
            ...registeredAdminRoutes,
          ],
        },
        {
          path: "settings",
          component: SettingsModuleLayout,
          meta: { superUser: true },
          children: [
            { path: "", name: "settings", component: SettingsPage, meta: { superUser: true } },
            {
              path: "modules",
              name: "settings.modules",
              component: ModulesSettingsPage,
              meta: { superUser: true },
            },
            {
              path: "api-clients",
              name: "settings.api-clients",
              component: ApiClientsSettingsPage,
              meta: { superUser: true },
            },
            {
              path: "permissions",
              name: "settings.permissions",
              component: PermissionsSettingsPage,
              meta: { superUser: true },
            },
            {
              path: "sessions",
              name: "settings.sessions",
              component: SessionsSettingsPage,
              meta: { superUser: true },
            },
            {
              path: "versioning",
              name: "settings.versioning",
              component: FormVersioningPage,
              meta: { superUser: true },
            },
          ],
        },
      ],
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  const publicPaths = new Set(["/login", "/401", "/403"]);

  if (!auth.checked) {
    await auth.loadMe();
  }

  if (to.path === "/login" && auth.isAuthenticated) {
    return { path: "/home" };
  }

  if (!publicPaths.has(to.path) && !auth.isAuthenticated) {
    return { path: "/login", query: { from: to.fullPath } };
  }

  if (to.meta?.superUser && !auth.isSuperUser) {
    return { path: "/403", query: { from: to.fullPath } };
  }

  const requiredPermissions = to.matched
    .flatMap((record) => {
      const fromList = Array.isArray(record.meta?.requiredPermissionsAll) ? record.meta.requiredPermissionsAll : [];
      const single = record.meta?.permission ? [record.meta.permission] : [];
      return [...fromList, ...single];
    })
    .filter(Boolean);

  if (requiredPermissions.some((permission) => !auth.hasPermission(permission))) {
    return { path: "/403", query: { from: to.fullPath } };
  }

  if (to.path === "/admin" || to.path.startsWith("/admin/")) {
    const canAccessAdmin = await hasAdminPortalAccess(auth).catch(() => false);
    if (!canAccessAdmin) {
      return { path: "/403", query: { from: to.fullPath } };
    }
  }

  const moduleKeys = [...new Set(to.matched.map((record) => record.meta?.moduleKey).filter(Boolean))];
  if (moduleKeys.length) {
    try {
      const runtime = await loadModulesRuntime();
      if (moduleKeys.some((moduleKey) => !isModuleActive(runtime, moduleKey))) {
        return { path: "/403", query: { from: to.fullPath } };
      }
    } catch {
      return true;
    }
  }

  return true;
});

export { router };
