<template>
  <n-layout class="shell">
    <n-layout-header bordered class="header">
      <div class="brand" @click="goHome">Core Platform</div>
      <div class="header-right">
        <n-tag type="info" size="small" :bordered="false">{{ currentModuleLabel }}</n-tag>

        <n-dropdown trigger="click" :options="userMenuOptions" @select="onUserMenuSelect">
          <n-button quaternary class="user-trigger">
            <n-space :size="8" align="center">
              <n-avatar size="small" round>{{ userInitials }}</n-avatar>
              <span class="user-email">{{ auth.user?.email }}</span>
              <n-icon size="14" class="caret-icon">
                <chevron-down-outline />
              </n-icon>
            </n-space>
          </n-button>
        </n-dropdown>
      </div>
    </n-layout-header>

    <n-layout-content class="content">
      <router-view />
    </n-layout-content>
  </n-layout>
</template>

<script setup>
import { computed, h, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  NLayout,
  NLayoutContent,
  NLayoutHeader,
  NDropdown,
  NButton,
  NTag,
  NAvatar,
  NSpace,
  NIcon,
  useMessage,
} from "naive-ui";
import {
  ChevronDownOutline,
  LogOutOutline,
  SettingsOutline,
  ShieldCheckmarkOutline,
} from "@vicons/ionicons5";
import { useAuthStore } from "../stores/auth";
import { getDefaultPortalPath, loadPortalItems } from "../services/portalNavigation";

const router = useRouter();
const route = useRoute();
const message = useMessage();
const auth = useAuthStore();
const portalModules = ref([]);

const currentModuleLabel = computed(() => {
  const path = route.path || "";
  const found = portalModules.value
    .filter((moduleDef) => path === moduleDef.to || path.startsWith(`${moduleDef.to}/`))
    .sort((a, b) => (b.to?.length || 0) - (a.to?.length || 0))[0];
  return found?.label || "Portal";
});

const userInitials = computed(() => {
  const name = auth.user?.name?.trim();
  if (name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("");
  }

  const email = auth.user?.email || "U";
  return email.slice(0, 1).toUpperCase();
});

function renderMenuIcon(icon) {
  return () => h(NIcon, null, { default: () => h(icon) });
}

function resolveModuleIcon(moduleKey) {
  if (moduleKey === "settings") return SettingsOutline;
  return ShieldCheckmarkOutline;
}

const userMenuOptions = computed(() => {
  const modules = portalModules.value.map((moduleDef) => ({
    label: moduleDef.label,
    key: `module:${moduleDef.key}`,
    icon: renderMenuIcon(moduleDef.icon || resolveModuleIcon(moduleDef.key)),
  }));

  return [
    ...modules,
    { type: "divider", key: "divider-main" },
    { label: "Logout", key: "logout", icon: renderMenuIcon(LogOutOutline) },
  ];
});

async function onUserMenuSelect(key) {
  if (key === "logout") {
    await auth.logout();
    message.success("Sessao encerrada");
    await router.push("/login");
    return;
  }

  if (typeof key === "string" && key.startsWith("module:")) {
    const moduleKey = key.replace("module:", "");
    const moduleDef = portalModules.value.find((item) => item.key === moduleKey);
    if (moduleDef) {
      await router.push(moduleDef.to);
    }
  }
}

async function goHome() {
  await router.push(await getDefaultPortalPath(auth));
}

onMounted(async () => {
  try {
    portalModules.value = await loadPortalItems(auth);
  } catch {
    portalModules.value = [];
  }
});
</script>

<style scoped>
.shell {
  min-height: 100vh;
}

.header {
  height: 56px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
}

.brand {
  font-weight: 700;
  cursor: pointer;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-trigger {
  padding-left: 8px;
  padding-right: 8px;
}

.user-email {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.caret-icon {
  opacity: 0.7;
}

.content {
  padding: 0;
}
</style>
