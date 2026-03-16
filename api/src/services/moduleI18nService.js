export function createModuleI18nService({ i18nService } = {}) {
  return {
    syncActiveModules(activeModules) {
      i18nService.rebuild(activeModules || []);
    },
  };
}
