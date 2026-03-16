<template>
  <n-card title="Settings - Permissions">
    <n-space vertical>
      <n-space justify="space-between">
        <n-input v-model:value="filters.search" placeholder="Buscar por key/descricao" clearable @keyup.enter="applySearch" />
        <n-space>
          <n-button @click="fetchItems">Atualizar</n-button>
          <n-button v-if="canWrite" type="primary" @click="openCreate">Nova permissao</n-button>
        </n-space>
      </n-space>

      <n-data-table :columns="columns" :data="filteredItems" :loading="loading" :pagination="false" />
    </n-space>

    <n-modal v-model:show="formModal.show" preset="card" :title="formModal.isEdit ? 'Editar permissao' : 'Nova permissao'" style="max-width: 640px">
      <n-form label-placement="top">
        <n-form-item label="Key">
          <n-input v-model:value="form.key" :disabled="formModal.isEdit" placeholder="ex: forms.people.financial.read" />
        </n-form-item>
        <n-form-item label="Descricao">
          <n-input v-model:value="form.description" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" />
        </n-form-item>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="closeModal">Cancelar</n-button>
          <n-button type="primary" :loading="saving" @click="submitForm">Salvar</n-button>
        </n-space>
      </template>
    </n-modal>
  </n-card>
</template>

<script setup>
import { computed, h, onMounted, reactive, ref } from "vue";
import {
  NButton,
  NCard,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NSpace,
  useMessage,
} from "naive-ui";
import { api } from "../../services/api";
import { useAuthStore } from "../../stores/auth";

const message = useMessage();
const auth = useAuthStore();

const loading = ref(false);
const saving = ref(false);
const items = ref([]);
const filters = reactive({ search: "" });

const formModal = reactive({ show: false, isEdit: false });
const form = reactive({ key: "", description: "" });

const canWrite = computed(() => auth.isSuperUser);
const canDelete = computed(() => auth.isSuperUser);

const filteredItems = computed(() => {
  const term = filters.search.trim().toLowerCase();
  if (!term) return items.value;

  return items.value.filter((item) => {
    const key = String(item.key || "").toLowerCase();
    const description = String(item.description || "").toLowerCase();
    return key.includes(term) || description.includes(term);
  });
});

const columns = computed(() => {
  const base = [
    { title: "key", key: "key" },
    { title: "descricao", key: "description", render: (row) => row.description || "-" },
  ];

  if (canWrite.value || canDelete.value) {
    base.push({
      title: "acoes",
      key: "actions",
      align: "right",
      render: (row) =>
        h("div", { style: "display:flex;justify-content:flex-end;gap:8px;" }, [
          canWrite.value
            ? h(
                NButton,
                { size: "small", onClick: () => openEdit(row) },
                { default: () => "Editar" }
              )
            : null,
          canDelete.value && row.key !== "*"
            ? h(
                NButton,
                { size: "small", type: "error", ghost: true, onClick: () => removeItem(row) },
                { default: () => "Excluir" }
              )
            : null,
        ]),
    });
  }

  return base;
});

function applySearch() {}

async function fetchItems() {
  loading.value = true;
  try {
    const data = await api("/settings/permissions");
    items.value = data.items || [];
  } catch (err) {
    message.error(err.message || "Falha ao listar permissoes");
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  form.key = "";
  form.description = "";
}

function openCreate() {
  resetForm();
  formModal.isEdit = false;
  formModal.show = true;
}

function openEdit(item) {
  form.key = item.key || "";
  form.description = item.description || "";
  formModal.isEdit = true;
  formModal.show = true;
}

function closeModal() {
  formModal.show = false;
}

function validateForm() {
  const key = form.key.trim();
  if (!key) return "Informe a key da permissao";

  const keyFormat = /^[a-z0-9]+(?:\.[a-z0-9_]+)+$/;
  if (!keyFormat.test(key)) {
    return "Formato invalido. Exemplo: people.acme.test.read";
  }

  return null;
}

async function submitForm() {
  const validationError = validateForm();
  if (validationError) {
    message.warning(validationError);
    return;
  }

  saving.value = true;
  try {
    const payload = {
      key: form.key.trim(),
      description: form.description.trim() || null,
    };

    if (formModal.isEdit) {
      await api(`/settings/permissions/${encodeURIComponent(payload.key)}`, {
        method: "PUT",
        body: JSON.stringify({ description: payload.description }),
      });
      message.success("Permissao atualizada");
    } else {
      await api("/settings/permissions", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      message.success("Permissao criada");
    }

    formModal.show = false;
    await fetchItems();
  } catch (err) {
    message.error(err.message || "Falha ao salvar permissao");
  } finally {
    saving.value = false;
  }
}

async function removeItem(item) {
  const ok = window.confirm(`Excluir permissao ${item.key}?`);
  if (!ok) return;

  try {
    await api(`/settings/permissions/${encodeURIComponent(item.key)}`, { method: "DELETE" });
    message.success("Permissao excluida");
    await fetchItems();
  } catch (err) {
    message.error(err.message || "Falha ao excluir permissao");
  }
}

onMounted(fetchItems);
</script>
