import { coreAdminModule } from "../../../../platform-modules/core-admin/web/admin.js";
import { corePeopleAdminModule } from "../../../../platform-modules/core-people/web/admin.js";
import { coreScheduleAdminModule } from "../../../../platform-modules/core-schedule/web/admin.js";
import { peopleCustomAcmeAdminModule } from "../../../../platform-modules/people-custom-acme/web/admin.js";

const adminModules = [coreAdminModule, corePeopleAdminModule, coreScheduleAdminModule, peopleCustomAcmeAdminModule];

export function getRegisteredAdminRoutes() {
  return adminModules.flatMap((moduleDef) =>
    (moduleDef.routes || []).map((route) => ({
      ...route,
      meta: {
        ...(route.meta || {}),
        moduleKey: moduleDef.key,
      },
    }))
  );
}

export function getRegisteredAdminModules() {
  return adminModules.slice();
}
