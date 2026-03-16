<template>
  <n-card title="Roles">
    <template #header-extra>
      <n-space>
        <n-button @click="fetchRoles">Atualizar</n-button>
        <n-button type="primary" v-if="canWrite" @click="goNew">Nova role</n-button>
      </n-space>
    </template>

    <n-space vertical>
      <n-data-table :columns="columns" :data="roles" :loading="loading" :pagination="false" />
    </n-space>
  </n-card>
</template>

<script setup>
import { computed, h, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { NButton, NCard, NDataTable, NSpace, useMessage } from "naive-ui";
import { api } from "../../../services/api";
import { useAuthStore } from "../../../stores/auth";

const router = useRouter();
const message = useMessage();
const auth = useAuthStore();

const loading = ref(false);
const roles = ref([]);
const canWrite = computed(() => auth.hasPermission("roles.write"));

const columns = computed(() => {
  const base = [
    { title: "key", key: "key" },
    { title: "name", key: "name" },
    { title: "inactive", key: "inactive", render: (row) => (row.inactive ? "true" : "false") },
  ];

  if (canWrite.value) {
    base.push({
      title: "acoes",
      key: "actions",
      align: "right",
      render: (row) =>
        h(
          NButton,
          { size: "small", onClick: () => router.push(`/admin/roles/${row.id}`) },
          { default: () => "Editar" }
        ),
    });
  }

  return base;
});

async function fetchRoles() {
  loading.value = true;
  try {
    const data = await api("/roles");
    roles.value = data.items || [];
  } catch (err) {
    message.error(err.message || "Falha ao listar roles");
  } finally {
    loading.value = false;
  }
}

function goNew() {
  router.push("/admin/roles/new");
}

onMounted(fetchRoles);
</script>
