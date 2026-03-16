<template>
  <n-layout has-sider class="admin-shell">
    <n-layout-sider bordered collapse-mode="width" :collapsed-width="64" :width="240" show-trigger>
      <div class="brand">Core</div>
      <n-menu :options="filteredMenuOptions" :value="activeKey" @update:value="onMenuSelect" />
    </n-layout-sider>

    <n-layout>
      <n-layout-header bordered class="header">
        <div class="title">Administration Portal</div>
        <div class="user">{{ auth.user?.email }}</div>
      </n-layout-header>

      <n-layout-content class="content">
        <router-view />
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>

<script setup>
import { computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import {
  NLayout,
  NLayoutSider,
  NLayoutHeader,
  NLayoutContent,
  NMenu,
  useMessage,
} from "naive-ui";

import { menuOptions } from "../router";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const route = useRoute();
const message = useMessage();
const auth = useAuthStore();

const filteredMenuOptions = computed(() => filterMenuByPermission(menuOptions));

const activeKey = computed(() => {
  if (route.path.startsWith("/admin/users")) return "admin-users";
  if (route.path.startsWith("/admin/roles")) return "admin-roles";
  if (route.path.startsWith("/settings/permissions")) return "settings-permissions";
  if (route.path.startsWith("/settings")) return "settings-general";
  return "";
});

async function onMenuSelect(key) {
  const item = findMenuItem(filteredMenuOptions.value, key);
  if (!item) return;

  if (item.action === "logout") {
    await auth.logout();
    message.success("Sessao encerrada");
    await router.push("/login");
    return;
  }

  if (item.to) {
    await router.push(item.to);
  }
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

function filterMenuByPermission(options) {
  const output = [];

  for (const option of options) {
    if (option.permission && !auth.hasPermission(option.permission)) {
      continue;
    }

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
</script>

<style scoped>
.admin-shell {
  min-height: 100vh;
}

.brand {
  padding: 16px;
  font-weight: 700;
  font-size: 18px;
}

.header {
  height: 56px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-weight: 700;
}

.user {
  font-size: 13px;
  opacity: 0.8;
}

.content {
  padding: 16px;
}
</style>
