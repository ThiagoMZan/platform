<template>
  <n-breadcrumb class="app-breadcrumb">
    <n-breadcrumb-item v-for="(item, index) in items" :key="item.path">
      <router-link v-if="index < items.length - 1" :to="item.path" class="crumb-link">
        <n-icon size="14"><component :is="item.icon" /></n-icon>
        <span>{{ item.label }}</span>
      </router-link>
      <span v-else class="crumb-link">
        <n-icon size="14"><component :is="item.icon" /></n-icon>
        <span>{{ item.label }}</span>
      </span>
    </n-breadcrumb-item>
  </n-breadcrumb>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { NBreadcrumb, NBreadcrumbItem, NIcon } from "naive-ui";
import { flattenMenu, getIconByName, loadAdminModuleMenu, sharedIcons } from "../services/modulesRuntime";

const route = useRoute();
const runtimeAdminMenu = ref([]);

const labelBySegment = {
  home: "Inicio",
  admin: "Administrador",
  users: "Usuarios",
  roles: "Roles",
  settings: "Configuracoes",
  permissions: "Permissoes",
  sessions: "Sessoes",
  versioning: "Versionamento",
  modules: "Modulos",
  new: "Novo",
};

const iconBySegment = {
  home: sharedIcons.HomeOutline,
  admin: sharedIcons.ShieldCheckmarkOutline,
  users: sharedIcons.PeopleOutline,
  user_item: sharedIcons.PersonOutline,
  roles: sharedIcons.KeyOutline,
  settings: sharedIcons.SettingsOutline,
  permissions: sharedIcons.KeyOutline,
  sessions: sharedIcons.PeopleOutline,
  versioning: sharedIcons.GitBranchOutline,
  modules: sharedIcons.SettingsOutline,
  new: sharedIcons.AddOutline,
  edit: sharedIcons.CreateOutline,
};

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
}

function findBestMenuMatch(path) {
  const flattened = flattenMenu(runtimeAdminMenu.value)
    .filter(({ option }) => option.to)
    .filter(({ option }) => path === option.to || path.startsWith(`${option.to}/`))
    .sort((a, b) => (b.option.to?.length || 0) - (a.option.to?.length || 0));

  return flattened[0] || null;
}

function buildRuntimeAdminTrail(path) {
  const match = findBestMenuMatch(path);
  if (!match) return null;

  const parentItems = match.parents
    .filter((item) => item.to)
    .map((item) => ({
      key: item.key,
      label: item.label,
      path: item.to,
      icon: item.icon || getIconByName("home-outline"),
    }));

  const items = [
    { key: "admin", label: "Administrador", path: "/admin", icon: iconBySegment.admin },
    ...parentItems,
    {
      key: match.option.key,
      label: match.option.label,
      path: match.option.to,
      icon: match.option.icon || getIconByName("home-outline"),
    },
  ];

  if (path === `${match.option.to}/new`) {
    items.push({ key: "new", label: "Novo", path, icon: iconBySegment.new });
  } else if (path !== match.option.to && /\/[^/]+$/.test(path)) {
    const lastSegment = path.split("/").filter(Boolean).at(-1);
    if (lastSegment && lastSegment !== "new") {
      items.push({ key: "edit", label: "Editar", path, icon: iconBySegment.edit });
    }
  }

  return items;
}

const items = computed(() => {
  const segments = route.path.split("/").filter(Boolean);
  if (!segments.length) return [{ label: "Inicio", path: "/home", icon: sharedIcons.HomeOutline }];

  if (segments[0] === "admin") {
    const runtimeItems = buildRuntimeAdminTrail(route.path);
    if (runtimeItems) {
      return runtimeItems;
    }
  }

  return segments.map((segment, index) => {
    const path = `/${segments.slice(0, index + 1).join("/")}`;

    let key = segment;
    let label = labelBySegment[segment] || decodeURIComponent(segment);

    if (isUuid(segment)) {
      key = "edit";
      label = "Editar";
    }

    return {
      label,
      path,
      icon: iconBySegment[key] || sharedIcons.HomeOutline,
    };
  });
});

onMounted(async () => {
  try {
    runtimeAdminMenu.value = await loadAdminModuleMenu();
  } catch {
    runtimeAdminMenu.value = [];
  }
});
</script>

<style scoped>
.app-breadcrumb {
  margin-bottom: 12px;
}

.crumb-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
