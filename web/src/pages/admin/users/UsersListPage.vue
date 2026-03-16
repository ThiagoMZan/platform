<template>
  <n-card title="Users">
    <n-space vertical>
      <n-space justify="space-between">
        <n-input v-model:value="filters.search" placeholder="Buscar por nome/email" clearable @keyup.enter="onSearch" />
        <n-space>
          <n-button @click="onSearch">Buscar</n-button>
          <n-button v-if="canWrite" type="primary" @click="goNew">Novo usuario</n-button>
        </n-space>
      </n-space>

      <n-data-table
        remote
        :columns="columns"
        :data="users"
        :loading="loading"
        :pagination="tablePagination"
        @update:page="onPageChange"
        @update:page-size="onPageSizeChange"
        @update:sorter="onSorterChange"
      />
    </n-space>
  </n-card>
</template>

<script setup>
import { computed, h, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import {
  NButton,
  NCard,
  NCheckbox,
  NDataTable,
  NInput,
  NSpace,
  useMessage,
} from "naive-ui";
import { api } from "../../../services/api";
import { useAuthStore } from "../../../stores/auth";

const router = useRouter();
const message = useMessage();
const auth = useAuthStore();

const loading = ref(false);
const users = ref([]);
const filters = reactive({ search: "" });
const pagination = reactive({ page: 1, page_size: 10, total: 0 });
const sorting = reactive({ sort_by: "created_at", sort_dir: "desc" });

const canWrite = computed(() => auth.hasPermission("users.write"));

const columns = computed(() => {
  const base = [
    { title: "name", key: "name", sorter: true },
    { title: "email", key: "email", sorter: true },
    {
      title: "inactive",
      key: "inactive",
      sorter: true,
      render: (row) => h(NCheckbox, { checked: !!row.inactive, disabled: true }),
    },
  ];

  if (canWrite.value) {
    base.push({
      title: "acoes",
      key: "actions",
      align: "right",
      render: (row) =>
        h(
          NButton,
          {
            size: "small",
            onClick: () => router.push(`/admin/users/${row.id}`),
          },
          { default: () => "Editar" }
        ),
    });
  }

  return base;
});

const tablePagination = computed(() => ({
  page: pagination.page,
  pageSize: pagination.page_size,
  itemCount: pagination.total,
  pageSizes: [10, 20, 50],
  showSizePicker: true,
}));

async function fetchUsers() {
  loading.value = true;
  try {
    const query = new URLSearchParams({
      page: String(pagination.page),
      page_size: String(pagination.page_size),
      search: filters.search,
      sort_by: sorting.sort_by,
      sort_dir: sorting.sort_dir,
    });

    const data = await api(`/users?${query.toString()}`);
    users.value = data.items || [];
    pagination.total = data.pagination?.total || 0;
  } catch (err) {
    message.error(err.message || "Falha ao listar usuarios");
  } finally {
    loading.value = false;
  }
}

function goNew() {
  router.push("/admin/users/new");
}

function onPageChange(page) {
  pagination.page = page;
  fetchUsers();
}

function onPageSizeChange(pageSize) {
  pagination.page_size = pageSize;
  pagination.page = 1;
  fetchUsers();
}

function onSorterChange(sorter) {
  if (!sorter || !sorter.columnKey || !sorter.order) {
    sorting.sort_by = "created_at";
    sorting.sort_dir = "desc";
    fetchUsers();
    return;
  }

  sorting.sort_by = String(sorter.columnKey);
  sorting.sort_dir = sorter.order === "ascend" ? "asc" : "desc";
  fetchUsers();
}

function onSearch() {
  pagination.page = 1;
  fetchUsers();
}

onMounted(fetchUsers);
</script>
