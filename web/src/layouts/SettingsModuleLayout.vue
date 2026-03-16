<template>
  <n-layout has-sider class="module-shell">
    <n-layout-sider
      v-model:collapsed="collapsed"
      bordered
      class="settings-sider"
      collapse-mode="width"
      :collapsed-width="64"
      :width="240"
      show-trigger
    >
      <n-menu
        :collapsed="collapsed"
        :collapsed-width="64"
        :collapsed-icon-size="20"
        :options="filteredMenu"
        :value="activeKey"
        @update:value="onMenuSelect"
      />
    </n-layout-sider>

    <n-layout-content class="module-content">
      <app-breadcrumb />
      <router-view />
    </n-layout-content>
  </n-layout>
</template>

<script setup>
import { computed, h, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NLayout, NLayoutContent, NLayoutSider, NMenu, NIcon } from "naive-ui";
import AppBreadcrumb from "../components/AppBreadcrumb.vue";
import { CogOutline, ExtensionPuzzleOutline, KeyOutline, PeopleOutline, GitBranchOutline, ServerOutline } from "@vicons/ionicons5";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const collapsed = ref(false);

function renderIcon(icon) {
  return () => h(NIcon, null, { default: () => h(icon) });
}

const settingsMenu = [
  {
    label: "Geral",
    key: "settings-general",
    to: "/settings",
    icon: renderIcon(CogOutline),
  },
  {
    label: "Modulos",
    key: "settings-modules",
    to: "/settings/modules",
    icon: renderIcon(ExtensionPuzzleOutline),
  },
  {
    label: "API Clients",
    key: "settings-api-clients",
    to: "/settings/api-clients",
    icon: renderIcon(ServerOutline),
  },
  {
    label: "Permissoes",
    key: "settings-permissions",
    to: "/settings/permissions",
    icon: renderIcon(KeyOutline),
  },
  {
    label: "Sessoes",
    key: "settings-sessions",
    to: "/settings/sessions",
    icon: renderIcon(PeopleOutline),
  },
  {
    label: "Versionamento",
    key: "settings-versioning",
    to: "/settings/versioning",
    icon: renderIcon(GitBranchOutline),
  },
];

const filteredMenu = computed(() => filterMenuByPermission(settingsMenu));

const activeKey = computed(() => {
  if (route.path.startsWith("/settings/modules")) return "settings-modules";
  if (route.path.startsWith("/settings/api-clients")) return "settings-api-clients";
  if (route.path.startsWith("/settings/permissions")) return "settings-permissions";
  if (route.path.startsWith("/settings/sessions")) return "settings-sessions";
  if (route.path.startsWith("/settings/versioning")) return "settings-versioning";
  if (route.path.startsWith("/settings")) return "settings-general";
  return "";
});

async function onMenuSelect(key) {
  const item = filteredMenu.value.find((entry) => entry.key === key);
  if (!item?.to) return;
  await router.push(item.to);
}

function filterMenuByPermission(options) {
  if (!auth.isSuperUser) return [];
  return options;
}
</script>

<style scoped>
.module-shell {
  height: calc(100vh - 56px);
}

.settings-sider {
  background: #f8f9fc;
}

.module-content {
  padding: 16px;
  min-height: calc(100vh - 56px);
}
</style>
