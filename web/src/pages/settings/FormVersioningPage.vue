<template>
  <n-card title="Settings - Versionamento de Forms">
    <n-space vertical>
      <n-space align="end" justify="space-between">
        <n-form inline :show-feedback="false">
          <n-form-item label="Form Key">
            <n-input v-model:value="formKey" placeholder="people.edit" style="width: 220px" />
          </n-form-item>
          <n-form-item>
            <n-button type="primary" :loading="loading" @click="loadFormVersions">Carregar</n-button>
          </n-form-item>
        </n-form>
        <n-button :loading="loading" @click="reloadAll">Atualizar</n-button>
      </n-space>

      <n-card size="small" title="Versoes do Form">
        <n-data-table :columns="formVersionColumns" :data="formVersions" :loading="loading" :pagination="false" />
      </n-card>

      <n-card size="small" title="Diff do Form">
        <n-space vertical>
          <n-space align="center" justify="space-between">
            <n-space>
              <n-select v-model:value="formDiff.from" :options="formVersionOptions" placeholder="Versao origem" style="width: 220px" />
              <n-select v-model:value="formDiff.to" :options="formVersionOptions" placeholder="Versao destino" style="width: 220px" />
            </n-space>
            <n-space align="center" :size="8">
              <n-text depth="3">Lock Scroll</n-text>
              <n-switch v-model:value="lockScroll" />
            </n-space>
          </n-space>

          <n-alert v-if="formDiffSummary" :type="formDiffSummary.changed.length ? 'warning' : 'success'" :show-icon="false">
            {{ formDiffSummary.changed.length ? `Alteracoes (${formDiffSummary.changed.length}): ${formDiffSummary.changed.join(', ')}` : 'Sem diferencas entre as versoes selecionadas.' }}
          </n-alert>

          <n-grid :cols="2" :x-gap="12">
            <n-gi>
              <div class="diff-panel">
                <div class="diff-header">Origem (v{{ formDiff.from ?? '-' }})</div>
                <div
                  ref="formLeftBodyRef"
                  class="diff-body"
                  @scroll="syncFormScroll('left')"
                >
                  <div
                    v-for="line in formLineDiff"
                    :key="`form-left-${line.index}`"
                    class="diff-line"
                    :class="lineClass('left', line.type)"
                  >
                    <span class="line-no">{{ line.index }}</span>
                    <pre class="line-text">{{ line.left }}</pre>
                  </div>
                </div>
              </div>
            </n-gi>
            <n-gi>
              <div class="diff-panel">
                <div class="diff-header">Destino (v{{ formDiff.to ?? '-' }})</div>
                <div
                  ref="formRightBodyRef"
                  class="diff-body"
                  @scroll="syncFormScroll('right')"
                >
                  <div
                    v-for="line in formLineDiff"
                    :key="`form-right-${line.index}`"
                    class="diff-line"
                    :class="lineClass('right', line.type)"
                  >
                    <span class="line-no">{{ line.index }}</span>
                    <pre class="line-text">{{ line.right }}</pre>
                  </div>
                </div>
              </div>
            </n-gi>
          </n-grid>
        </n-space>
      </n-card>

      <n-card size="small" title="Extensions do Form">
        <n-data-table
          :columns="extensionColumns"
          :data="extensions"
          :loading="loading"
          :pagination="false"
          :row-props="extensionRowProps"
        />
      </n-card>

      <n-card size="small" title="Historico da Extension Selecionada">
        <n-space vertical>
          <n-text depth="3" v-if="selectedExtensionId">ID: {{ selectedExtensionId }}</n-text>
          <n-text depth="3" v-else>Selecione uma extension na tabela acima.</n-text>

          <n-data-table
            :columns="extensionVersionColumns"
            :data="extensionVersions"
            :loading="extensionLoading"
            :pagination="false"
          />
        </n-space>
      </n-card>

      <n-card size="small" title="Diff da Extension">
        <n-space vertical>
          <n-space>
            <n-select v-model:value="extensionDiff.from" :options="extensionVersionOptions" placeholder="Versao origem" style="width: 220px" />
            <n-select v-model:value="extensionDiff.to" :options="extensionVersionOptions" placeholder="Versao destino" style="width: 220px" />
          </n-space>

          <n-alert v-if="extensionDiffSummary" :type="extensionDiffSummary.changed.length ? 'warning' : 'success'" :show-icon="false">
            {{ extensionDiffSummary.changed.length ? `Alteracoes (${extensionDiffSummary.changed.length}): ${extensionDiffSummary.changed.join(', ')}` : 'Sem diferencas entre as versoes selecionadas.' }}
          </n-alert>

          <n-grid :cols="2" :x-gap="12">
            <n-gi>
              <div class="diff-panel">
                <div class="diff-header">Origem (v{{ extensionDiff.from ?? '-' }})</div>
                <div
                  ref="extensionLeftBodyRef"
                  class="diff-body diff-body-sm"
                  @scroll="syncExtensionScroll('left')"
                >
                  <div
                    v-for="line in extensionLineDiff"
                    :key="`ext-left-${line.index}`"
                    class="diff-line"
                    :class="lineClass('left', line.type)"
                  >
                    <span class="line-no">{{ line.index }}</span>
                    <pre class="line-text">{{ line.left }}</pre>
                  </div>
                </div>
              </div>
            </n-gi>
            <n-gi>
              <div class="diff-panel">
                <div class="diff-header">Destino (v{{ extensionDiff.to ?? '-' }})</div>
                <div
                  ref="extensionRightBodyRef"
                  class="diff-body diff-body-sm"
                  @scroll="syncExtensionScroll('right')"
                >
                  <div
                    v-for="line in extensionLineDiff"
                    :key="`ext-right-${line.index}`"
                    class="diff-line"
                    :class="lineClass('right', line.type)"
                  >
                    <span class="line-no">{{ line.index }}</span>
                    <pre class="line-text">{{ line.right }}</pre>
                  </div>
                </div>
              </div>
            </n-gi>
          </n-grid>
        </n-space>
      </n-card>
    </n-space>
  </n-card>
</template>

<script setup>
import { computed, h, ref } from "vue";
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NForm,
  NFormItem,
  NGrid,
  NGi,
  NInput,
  NSelect,
  NSpace,
  NTag,
  NText,
  useMessage,
} from "naive-ui";
import { api } from "../../services/api";

const message = useMessage();

const formKey = ref("people.edit");
const loading = ref(false);
const extensionLoading = ref(false);

const formVersions = ref([]);
const extensions = ref([]);
const selectedExtensionId = ref("");
const extensionVersions = ref([]);
const formLeftBodyRef = ref(null);
const formRightBodyRef = ref(null);
const extensionLeftBodyRef = ref(null);
const extensionRightBodyRef = ref(null);
const formSyncing = ref(false);
const extensionSyncing = ref(false);
const lockScroll = ref(true);

const formDiff = ref({ from: null, to: null });
const extensionDiff = ref({ from: null, to: null });

const formVersionColumns = computed(() => [
  { title: "Versao", key: "version", width: 90 },
  { title: "Nome", key: "name" },
  { title: "Entity", key: "entity_key", width: 140 },
  { title: "Criado em", key: "created_at", render: (row) => formatDateTime(row.created_at), width: 170 },
  {
    title: "",
    key: "actions",
    width: 100,
    align: "right",
    render: (row) =>
      h(
        NButton,
        {
          size: "small",
          ghost: true,
          type: "warning",
          onClick: () => rollbackFormVersion(row.version),
        },
        { default: () => "Rollback" }
      ),
  },
]);

const extensionColumns = computed(() => [
  { title: "ID", key: "id" },
  { title: "Modulo", key: "module_key", width: 150 },
  { title: "Priority", key: "priority", width: 90 },
  {
    title: "Ativa",
    key: "enabled",
    width: 90,
    render: (row) =>
      h(
        NTag,
        { size: "small", type: row.enabled ? "success" : "default", bordered: false },
        { default: () => (row.enabled ? "Sim" : "Nao") }
      ),
  },
]);

const extensionVersionColumns = computed(() => [
  { title: "Versao", key: "version", width: 90 },
  { title: "Priority", key: "priority", width: 90 },
  {
    title: "Ativa",
    key: "enabled",
    width: 90,
    render: (row) =>
      h(
        NTag,
        { size: "small", type: row.enabled ? "success" : "default", bordered: false },
        { default: () => (row.enabled ? "Sim" : "Nao") }
      ),
  },
  { title: "Criado em", key: "created_at", render: (row) => formatDateTime(row.created_at), width: 170 },
  {
    title: "",
    key: "actions",
    width: 100,
    align: "right",
    render: (row) =>
      h(
        NButton,
        {
          size: "small",
          ghost: true,
          type: "warning",
          disabled: !selectedExtensionId.value,
          onClick: () => rollbackExtensionVersion(row.version),
        },
        { default: () => "Rollback" }
      ),
  },
]);

const formVersionOptions = computed(() =>
  formVersions.value.map((item) => ({
    label: `v${item.version} - ${formatDateTime(item.created_at)}`,
    value: item.version,
  }))
);

const extensionVersionOptions = computed(() =>
  extensionVersions.value.map((item) => ({
    label: `v${item.version} - ${formatDateTime(item.created_at)}`,
    value: item.version,
  }))
);

const formFromVersion = computed(() => formVersions.value.find((item) => item.version === formDiff.value.from) || null);
const formToVersion = computed(() => formVersions.value.find((item) => item.version === formDiff.value.to) || null);

const extensionFromVersion = computed(() =>
  extensionVersions.value.find((item) => item.version === extensionDiff.value.from) || null
);
const extensionToVersion = computed(() =>
  extensionVersions.value.find((item) => item.version === extensionDiff.value.to) || null
);

const formFromJson = computed(() => prettyJson(buildFormComparable(formFromVersion.value)));
const formToJson = computed(() => prettyJson(buildFormComparable(formToVersion.value)));
const extensionFromJson = computed(() => prettyJson(buildExtensionComparable(extensionFromVersion.value)));
const extensionToJson = computed(() => prettyJson(buildExtensionComparable(extensionToVersion.value)));

const formLineDiff = computed(() => buildLineDiff(formFromJson.value, formToJson.value));
const extensionLineDiff = computed(() => buildLineDiff(extensionFromJson.value, extensionToJson.value));

const formDiffSummary = computed(() => {
  if (!formFromVersion.value || !formToVersion.value) return null;
  const changed = diffPaths(buildFormComparable(formFromVersion.value), buildFormComparable(formToVersion.value));
  return { changed };
});

const extensionDiffSummary = computed(() => {
  if (!extensionFromVersion.value || !extensionToVersion.value) return null;
  const changed = diffPaths(
    buildExtensionComparable(extensionFromVersion.value),
    buildExtensionComparable(extensionToVersion.value)
  );
  return { changed };
});

function buildFormComparable(version) {
  if (!version) return null;
  return {
    name: version.name,
    entity_key: version.entity_key,
    permission_read: version.permission_read,
    permission_write: version.permission_write,
    permission_delete: version.permission_delete,
    schema: version.schema,
  };
}

function buildExtensionComparable(version) {
  if (!version) return null;
  return {
    priority: version.priority,
    enabled: version.enabled,
    patches: version.patches,
  };
}

function prettyJson(value) {
  if (value == null) return "Selecione uma versao.";
  return JSON.stringify(value, null, 2);
}

function buildLineDiff(leftText, rightText) {
  const leftLines = String(leftText || "").split("\n");
  const rightLines = String(rightText || "").split("\n");
  const max = Math.max(leftLines.length, rightLines.length);
  const rows = [];

  for (let i = 0; i < max; i += 1) {
    const left = leftLines[i] ?? "";
    const right = rightLines[i] ?? "";
    let type = "same";

    if (!left && right) {
      type = "added";
    } else if (left && !right) {
      type = "removed";
    } else if (left !== right) {
      type = "changed";
    }

    rows.push({
      index: i + 1,
      left,
      right,
      type,
    });
  }

  return rows;
}

function lineClass(side, type) {
  if (type === "same") return "";
  if (type === "changed") return "line-changed";
  if (type === "added") return side === "right" ? "line-added" : "line-empty";
  if (type === "removed") return side === "left" ? "line-removed" : "line-empty";
  return "";
}

function syncBodyScroll(sourceEl, targetEl, syncingRef) {
  if (!sourceEl || !targetEl || syncingRef.value) return;

  syncingRef.value = true;
  const sourceMax = sourceEl.scrollHeight - sourceEl.clientHeight;
  const targetMax = targetEl.scrollHeight - targetEl.clientHeight;
  const ratio = sourceMax > 0 ? sourceEl.scrollTop / sourceMax : 0;
  targetEl.scrollTop = ratio * Math.max(targetMax, 0);
  requestAnimationFrame(() => {
    syncingRef.value = false;
  });
}

function syncFormScroll(side) {
  if (side === "left") {
    syncBodyScroll(formLeftBodyRef.value, formRightBodyRef.value, formSyncing);
    return;
  }
  syncBodyScroll(formRightBodyRef.value, formLeftBodyRef.value, formSyncing);
}

function syncExtensionScroll(side) {
  if (side === "left") {
    syncBodyScroll(extensionLeftBodyRef.value, extensionRightBodyRef.value, extensionSyncing);
    return;
  }
  syncBodyScroll(extensionRightBodyRef.value, extensionLeftBodyRef.value, extensionSyncing);
}

function diffPaths(a, b, basePath = "") {
  if (a === b) return [];

  const aType = a === null ? "null" : Array.isArray(a) ? "array" : typeof a;
  const bType = b === null ? "null" : Array.isArray(b) ? "array" : typeof b;

  if (aType !== bType) return [basePath || "root"];
  if (aType !== "object" && aType !== "array") return [basePath || "root"];

  if (aType === "array") {
    if (a.length !== b.length) return [basePath || "root"];
    const out = [];
    for (let i = 0; i < a.length; i += 1) {
      out.push(...diffPaths(a[i], b[i], `${basePath}[${i}]`));
    }
    return out;
  }

  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const out = [];
  for (const key of keys) {
    const next = basePath ? `${basePath}.${key}` : key;
    if (!(key in (a || {})) || !(key in (b || {}))) {
      out.push(next);
      continue;
    }
    out.push(...diffPaths(a[key], b[key], next));
  }

  return out;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function extensionRowProps(row) {
  return {
    style: row.id === selectedExtensionId.value ? "background:#f0f6ff;" : "",
    onClick: () => selectExtension(row.id),
  };
}

async function loadFormVersions() {
  const key = formKey.value.trim();
  if (!key) {
    message.warning("Informe o form key");
    return;
  }

  loading.value = true;
  try {
    const [versionsRes, extRes] = await Promise.all([
      api(`/forms/${encodeURIComponent(key)}/versions`),
      api(`/forms/${encodeURIComponent(key)}/extensions`),
    ]);

    formVersions.value = versionsRes.items || [];
    extensions.value = extRes.items || [];

    if (formVersions.value.length >= 2) {
      formDiff.value.from = formVersions.value[1].version;
      formDiff.value.to = formVersions.value[0].version;
    } else {
      formDiff.value.from = formVersions.value[0]?.version ?? null;
      formDiff.value.to = formVersions.value[0]?.version ?? null;
    }

    if (!extensions.value.length) {
      selectedExtensionId.value = "";
      extensionVersions.value = [];
      extensionDiff.value.from = null;
      extensionDiff.value.to = null;
      return;
    }

    const currentExists = extensions.value.some((item) => item.id === selectedExtensionId.value);
    const targetId = currentExists ? selectedExtensionId.value : extensions.value[0].id;
    await selectExtension(targetId);
  } catch (err) {
    message.error(err.message || "Falha ao carregar versoes");
  } finally {
    loading.value = false;
  }
}

async function selectExtension(extensionId) {
  selectedExtensionId.value = extensionId;
  extensionLoading.value = true;
  try {
    const data = await api(`/forms/extensions/${encodeURIComponent(extensionId)}/versions`);
    extensionVersions.value = data.items || [];

    if (extensionVersions.value.length >= 2) {
      extensionDiff.value.from = extensionVersions.value[1].version;
      extensionDiff.value.to = extensionVersions.value[0].version;
    } else {
      extensionDiff.value.from = extensionVersions.value[0]?.version ?? null;
      extensionDiff.value.to = extensionVersions.value[0]?.version ?? null;
    }
  } catch (err) {
    message.error(err.message || "Falha ao carregar historico da extension");
  } finally {
    extensionLoading.value = false;
  }
}

async function rollbackFormVersion(version) {
  const ok = window.confirm(`Aplicar rollback do form ${formKey.value} para versao ${version}?`);
  if (!ok) return;

  try {
    await api(`/forms/${encodeURIComponent(formKey.value)}/versions/${version}/rollback`, { method: "POST" });
    message.success("Rollback do form aplicado");
    await loadFormVersions();
  } catch (err) {
    message.error(err.message || "Falha ao aplicar rollback do form");
  }
}

async function rollbackExtensionVersion(version) {
  if (!selectedExtensionId.value) return;

  const ok = window.confirm(`Aplicar rollback da extension para versao ${version}?`);
  if (!ok) return;

  try {
    await api(`/forms/extensions/${encodeURIComponent(selectedExtensionId.value)}/versions/${version}/rollback`, {
      method: "POST",
    });
    message.success("Rollback da extension aplicado");
    await Promise.all([loadFormVersions(), selectExtension(selectedExtensionId.value)]);
  } catch (err) {
    message.error(err.message || "Falha ao aplicar rollback da extension");
  }
}

async function reloadAll() {
  await loadFormVersions();
}

loadFormVersions();
</script>

<style scoped>
.diff-panel {
  border: 1px solid rgb(235, 237, 240);
  border-radius: 8px;
  overflow: hidden;
}

.diff-header {
  padding: 8px 10px;
  border-bottom: 1px solid rgb(235, 237, 240);
  font-size: 12px;
  font-weight: 600;
  color: rgb(82, 87, 94);
  background: rgb(250, 251, 252);
}

.diff-body {
  max-height: 360px;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.45;
}

.diff-body-sm {
  max-height: 280px;
}

.diff-line {
  display: grid;
  grid-template-columns: 44px 1fr;
  gap: 8px;
  padding: 0 8px;
  border-bottom: 1px solid rgb(245, 246, 247);
}

.line-no {
  color: rgb(140, 145, 150);
  text-align: right;
  user-select: none;
  padding-top: 2px;
}

.line-text {
  margin: 0;
  white-space: pre;
  padding: 2px 0;
}

.line-added {
  background: rgb(238, 251, 243);
}

.line-removed {
  background: rgb(254, 240, 240);
}

.line-changed {
  background: rgb(255, 248, 230);
}

.line-empty {
  background: rgb(250, 251, 252);
}
</style>

