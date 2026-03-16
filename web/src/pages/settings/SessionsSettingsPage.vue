<template>
  <n-card title="Settings - Sessoes Ativas">
    <n-space vertical>
      <n-space justify="end" align="center">
        <n-button @click="fetchItems" :loading="loading">Atualizar</n-button>
      </n-space>

      <n-data-table :columns="columns" :data="items" :loading="loading" :pagination="false" />
    </n-space>
  </n-card>
</template>

<script setup>
import { computed, h, onMounted, ref } from "vue";
import { NButton, NCard, NDataTable, NSpace, NTag, useMessage } from "naive-ui";
import { api } from "../../services/api";
import { useAuthStore } from "../../stores/auth";

const message = useMessage();
const auth = useAuthStore();

const loading = ref(false);
const items = ref([]);

const canWrite = computed(() => auth.isSuperUser);

const columns = computed(() => [
  {
    title: "Usuario",
    key: "user",
    render: (row) =>
      h("div", { style: "display:flex;align-items:center;gap:8px;" }, [
        h("span", {}, `${row.user_name || "-"} (${row.user_email || "-"})`),
        row.is_current
          ? h(
              NTag,
              {
                type: "success",
                size: "small",
                bordered: false,
              },
              { default: () => "Current" }
            )
          : null,
      ]),
  },
  { title: "Endereco IP", key: "ip", render: (row) => row.ip || "-" },
  { title: "SO", key: "os" },
  { title: "Navegador", key: "browser" },
  { title: "Iniciado em", key: "created_at", render: (row) => formatDateTime(row.created_at) },
  { title: "Expira em", key: "expires_at", render: (row) => formatDateTime(row.expires_at) },
  {
    title: "",
    key: "actions",
    width: 90,
    align: "right",
    render: (row) => {
      if (!canWrite.value) return null;

      return h(
        NButton,
        {
          size: "small",
          type: "error",
          ghost: true,
          disabled: !!row.is_current,
          onClick: () => revokeSession(row),
        },
        { default: () => "Encerrar" }
      );
    },
  },
]);

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

async function fetchItems() {
  loading.value = true;
  try {
    const data = await api("/settings/sessions");
    items.value = data.items || [];
  } catch (err) {
    message.error(err.message || "Falha ao listar sessoes");
  } finally {
    loading.value = false;
  }
}

async function revokeSession(row) {
  const ok = window.confirm(`Encerrar sessao de ${row.user_name || row.user_email}?`);
  if (!ok) return;

  try {
    await api(`/settings/sessions/${encodeURIComponent(row.id)}/revoke`, { method: "POST" });
    message.success("Sessao encerrada");
    await fetchItems();
  } catch (err) {
    message.error(err.message || "Falha ao encerrar sessao");
  }
}

onMounted(fetchItems);
</script>
