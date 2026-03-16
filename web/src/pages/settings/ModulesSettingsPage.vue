<template>
  <n-space vertical :size="16">
    <n-card title="Settings - Modulos">
      <n-space vertical>
        <n-alert type="info" :show-icon="false">
          Gerencie os modulos instalados nesta instalacao e escolha quais ficam ativos.
        </n-alert>

        <n-alert v-if="platformInfo" type="default" :show-icon="false">
          Plataforma atual: <strong>{{ platformInfo.name }}</strong>
          <template v-if="platformInfo.version"> - v{{ platformInfo.version }}</template>
        </n-alert>

        <n-space align="end" justify="end">
          <n-space>
            <n-button :loading="syncing" @click="syncLocalModules">Sync Local</n-button>
            <n-button :loading="loading" @click="loadAll">Atualizar</n-button>
          </n-space>
        </n-space>
      </n-space>
    </n-card>

    <n-card title="Modulos sincronizados, ativos ou instalados">
      <n-data-table :columns="installedColumns" :data="moduleRows" :loading="loading" :pagination="false" />
    </n-card>

    <n-modal v-model:show="dependenciesModalVisible" preset="card" title="Dependencias faltando" style="max-width: 720px">
      <n-space vertical>
        <n-alert type="warning" :show-icon="false">
          O modulo nao pode ser ativado enquanto essas dependencias nao estiverem instaladas na plataforma.
        </n-alert>
        <pre class="json-preview">{{ missingDependenciesPreview }}</pre>
      </n-space>
    </n-modal>
  </n-space>
</template>

<script setup>
import { computed, h, onMounted, ref } from "vue";
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NModal,
  NSpace,
  NTag,
  useMessage,
} from "naive-ui";
import { api } from "../../services/api";
import { resetModulesRuntimeCache } from "../../services/modulesRuntime";

const message = useMessage();

const loading = ref(false);
const syncing = ref(false);
const installedItems = ref([]);
const catalogItems = ref([]);
const platformInfo = ref(null);
const dependenciesModalVisible = ref(false);
const missingDependencies = ref(null);

const moduleRows = computed(() => {
  const installedByKey = new Map((installedItems.value || []).map((item) => [item.module_key, item]));
  const rows = [];

  for (const catalogItem of catalogItems.value || []) {
    const installed = installedByKey.get(catalogItem.module_key);
    rows.push({
      module_key: catalogItem.module_key,
      module_name: catalogItem.module_name,
      version: installed?.version || catalogItem.version,
      enabled: Boolean(installed?.enabled),
      is_installed: Boolean(installed),
      base_order: installed?.base_order ?? catalogItem.base_order,
      order_override: installed?.order_override ?? null,
    });
    installedByKey.delete(catalogItem.module_key);
  }

  for (const installed of installedByKey.values()) {
    rows.push({
      module_key: installed.module_key,
      module_name: installed.module_name,
      version: installed.version,
      enabled: Boolean(installed.enabled),
      is_installed: true,
      base_order: installed.base_order,
      order_override: installed.order_override ?? null,
    });
  }

  return rows.sort((a, b) => String(a.module_name || "").localeCompare(String(b.module_name || "")));
});

const installedColumns = computed(() => [
  { title: "Nome", key: "module_name", width: 220 },
  { title: "Versao", key: "version", width: 120 },
  {
    title: "Status",
    key: "enabled",
    width: 110,
    render: (row) =>
      h(
        NTag,
        {
          size: "small",
          type: row.enabled ? "success" : row.is_installed ? "warning" : "default",
          bordered: false,
        },
        { default: () => (row.enabled ? "Ativo" : row.is_installed ? "Inativo" : "Sincronizado") }
      ),
  },
  { title: "Key", key: "module_key", width: 180 },
  { title: "Order", key: "order_override", width: 100, render: (row) => row.order_override ?? row.base_order ?? "-" },
  {
    title: "",
    key: "actions",
    width: 120,
    align: "right",
    render: (row) =>
      h(
        NButton,
        {
          size: "small",
          type: row.enabled ? "default" : "primary",
          ghost: row.enabled,
          onClick: () => (row.enabled ? deactivateModule(row.module_key) : activateModule(row.module_key, row.version)),
        },
        { default: () => (row.enabled ? "Desativar" : row.is_installed ? "Ativar" : "Instalar") }
      ),
  },
]);

const missingDependenciesPreview = computed(() => {
  const details = missingDependencies.value || {};
  const apiDependencies = Object.fromEntries(
    (details.missing_api_dependencies || []).map((item) => [item.name, item.version])
  );
  const webDependencies = Object.fromEntries(
    (details.missing_web_dependencies || []).map((item) => [item.name, item.version])
  );

  return JSON.stringify(
    {
      apiDependencies,
      webDependencies,
    },
    null,
    2
  );
});

async function loadAll() {
  loading.value = true;
  try {
    const [installedRes, catalogRes, platformRes] = await Promise.all([
      api("/modules/installed"),
      api("/modules/catalog"),
      api("/modules/platform"),
    ]);

    installedItems.value = installedRes.items || [];
    catalogItems.value = catalogRes.items || [];
    platformInfo.value = platformRes.platform || null;
  } catch (err) {
    message.error(err.message || "Falha ao carregar modulos");
  } finally {
    loading.value = false;
  }
}

async function syncLocalModules() {
  syncing.value = true;
  try {
    await api("/modules/sync-local", { method: "POST", body: {} });
    resetModulesRuntimeCache();
    message.success("Catalogo sincronizado");
    await loadAll();
  } catch (err) {
    message.error(err.message || "Falha ao sincronizar modulos");
  } finally {
    syncing.value = false;
  }
}

async function activateModule(moduleKey, version) {
  try {
    await api("/modules/activate", {
      method: "POST",
      body: { module_key: moduleKey, version },
    });
    resetModulesRuntimeCache();
    message.success(`Modulo ${moduleKey}@${version} ativado`);
    await loadAll();
  } catch (err) {
    if (err.message === "module_dependencies_missing") {
      missingDependencies.value = err.body?.details || null;
      dependenciesModalVisible.value = true;
      return;
    }
    message.error(err.message || "Falha ao ativar modulo");
  }
}

async function deactivateModule(moduleKey) {
  const ok = window.confirm(`Desativar modulo ${moduleKey}?`);
  if (!ok) return;

  try {
    await api("/modules/deactivate", {
      method: "POST",
      body: { module_key: moduleKey },
    });
    resetModulesRuntimeCache();
    message.success(`Modulo ${moduleKey} desativado`);
    await loadAll();
  } catch (err) {
    message.error(err.message || "Falha ao desativar modulo");
  }
}

onMounted(loadAll);
</script>

<style scoped>
.json-preview {
  margin: 0;
  padding: 12px;
  border: 1px solid rgb(235, 237, 240);
  border-radius: 8px;
  background: rgb(250, 251, 252);
  overflow: auto;
  max-height: 420px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.45;
}
</style>
