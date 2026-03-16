<template>
  <n-layout has-sider class="module-shell">
    <n-layout-sider
      v-model:collapsed="collapsed"
      bordered
      collapse-mode="width"
      :collapsed-width="64"
      :width="260"
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
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NLayout, NLayoutContent, NLayoutSider, NMenu } from "naive-ui";
import AppBreadcrumb from "../components/AppBreadcrumb.vue";
import { useAuthStore } from "../stores/auth";
import { loadAdminModuleMenu, mapMenuIcons } from "../services/modulesRuntime";

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const collapsed = ref(false);
const runtimeMenu = ref([]);
const adminMenu = computed(() => mapMenuIcons(runtimeMenu.value));

const filteredMenu = computed(() => filterMenuByPermission(adminMenu.value));

const activeKey = computed(() => findActiveKey(filteredMenu.value, route.path));

async function onMenuSelect(key) {
  const item = findMenuItem(filteredMenu.value, key);
  if (!item?.to) return;
  await router.push(item.to);
}

function findMenuItem(options, key) {
  for (const option of options) {
    if (option.key === key) return option;
    if (option.children) {
      const found = findMenuItem(option.children, key);
      if (found) return found;
    }
  }
  return null;
}

function findActiveKey(options, currentPath) {
  for (const option of options) {
    if (option.children) {
      const found = findActiveKey(option.children, currentPath);
      if (found) return found;
    }
    if (option.to === currentPath) return option.key;
    if (option.to && currentPath.startsWith(`${option.to}/`)) return option.key;
  }
  return "";
}

function filterMenuByPermission(options) {
  const output = [];

  for (const option of options) {
    if (option.permission && !auth.hasPermission(option.permission)) continue;

    if (option.children?.length) {
      const children = filterMenuByPermission(option.children);
      if (!children.length) continue;
      output.push({ ...option, children });
      continue;
    }

    output.push(option);
  }

  return output;
}

onMounted(async () => {
  try {
    runtimeMenu.value = await loadAdminModuleMenu({ force: true });
  } catch {
    runtimeMenu.value = [];
  }
});
</script>

<style scoped>
.module-shell {
  height: calc(100vh - 56px);
}

.module-content {
  padding: 16px;
  min-height: calc(100vh - 56px);
}
</style>
