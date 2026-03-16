<template>
  <n-card title="Settings - API Clients">
    <n-space vertical>
      <n-space justify="space-between">
        <n-input
          v-model:value="filters.search"
          placeholder="Buscar por nome, key ou owner"
          clearable
        />
        <n-space>
          <n-button :loading="loading" @click="fetchItems">Atualizar</n-button>
          <n-button type="primary" @click="openCreate">Novo client</n-button>
        </n-space>
      </n-space>

      <n-data-table :columns="columns" :data="filteredItems" :loading="loading" :pagination="false" />
    </n-space>

    <n-modal
      v-model:show="formModal.show"
      preset="card"
      :title="formModal.isEdit ? 'Editar API client' : 'Novo API client'"
      style="max-width: 760px"
    >
      <n-form label-placement="top">
        <n-grid :cols="2" :x-gap="16">
          <n-form-item-gi label="Nome">
            <n-input v-model:value="form.name" placeholder="Ex: Integracao ERP" />
          </n-form-item-gi>
          <n-form-item-gi label="Ativo">
            <n-switch v-model:value="form.active" :disabled="!formModal.isEdit" />
          </n-form-item-gi>
        </n-grid>

        <n-form-item v-if="formModal.isEdit" label="Client Key">
          <n-input :value="form.client_key" readonly />
        </n-form-item>

        <n-form-item label="Descricao">
          <n-input
            v-model:value="form.description"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 4 }"
            placeholder="Descricao opcional"
          />
        </n-form-item>

        <n-grid :cols="2" :x-gap="16">
          <n-form-item-gi label="Owner">
            <n-select
              v-model:value="form.owner_user_id"
              :options="ownerOptions"
              clearable
              filterable
              placeholder="Sem owner"
            />
          </n-form-item-gi>
          <n-form-item-gi label="Expira em">
            <n-date-picker
              v-model:value="form.expires_at"
              type="datetime"
              clearable
              style="width: 100%"
            />
          </n-form-item-gi>
        </n-grid>

        <n-form-item label="Permissoes">
          <n-select
            v-model:value="form.permission_keys"
            multiple
            filterable
            clearable
            :options="permissionOptions"
            placeholder="Selecione as permissoes"
          />
        </n-form-item>
      </n-form>

      <template #footer>
        <n-space justify="space-between">
          <n-button
            v-if="formModal.isEdit"
            type="warning"
            ghost
            :loading="rotatingSecret"
            @click="rotateSecret"
          >
            Rotacionar segredo
          </n-button>
          <span v-else />
          <n-space>
            <n-button @click="closeFormModal">Cancelar</n-button>
            <n-button type="primary" :loading="saving" @click="submitForm">Salvar</n-button>
          </n-space>
        </n-space>
      </template>
    </n-modal>

    <n-modal
      v-model:show="secretModal.show"
      preset="card"
      title="Credenciais do API client"
      style="max-width: 720px"
    >
      <n-alert type="warning" :show-icon="false">
        Copie o segredo agora. Depois ele nao podera mais ser visualizado.
      </n-alert>

      <n-form label-placement="top" style="margin-top: 16px">
        <n-form-item label="Client Key">
          <n-input :value="secretModal.clientKey" readonly />
        </n-form-item>
        <n-form-item label="Client Secret">
          <n-input :value="secretModal.clientSecret" readonly type="textarea" :autosize="{ minRows: 3, maxRows: 5 }" />
        </n-form-item>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button type="primary" @click="secretModal.show = false">Fechar</n-button>
        </n-space>
      </template>
    </n-modal>
  </n-card>
</template>

<script setup>
import { computed, h, onMounted, reactive, ref } from "vue";
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NDatePicker,
  NForm,
  NFormItem,
  NFormItemGi,
  NGrid,
  NInput,
  NModal,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
  useMessage,
} from "naive-ui";
import { api } from "../../services/api";

const message = useMessage();

const loading = ref(false);
const saving = ref(false);
const rotatingSecret = ref(false);
const items = ref([]);
const permissionOptions = ref([]);
const ownerOptions = ref([]);
const filters = reactive({ search: "" });

const formModal = reactive({ show: false, isEdit: false, id: null });
const secretModal = reactive({ show: false, clientKey: "", clientSecret: "" });
const form = reactive({
  name: "",
  description: "",
  active: true,
  client_key: "",
  owner_user_id: null,
  expires_at: null,
  permission_keys: [],
});

const filteredItems = computed(() => {
  const term = filters.search.trim().toLowerCase();
  if (!term) return items.value;

  return items.value.filter((item) => {
    const haystack = [
      item.name,
      item.client_key,
      item.owner_user_name,
      item.owner_user_email,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });
});

const columns = computed(() => [
  { title: "Nome", key: "name" },
  { title: "Client Key", key: "client_key" },
  {
    title: "Owner",
    key: "owner",
    render: (row) => {
      if (!row.owner_user_id) return "-";
      const parts = [row.owner_user_name, row.owner_user_email].filter(Boolean);
      return parts.join(" - ") || row.owner_user_id;
    },
  },
  {
    title: "Status",
    key: "status",
    render: (row) =>
      h(
        NTag,
        { type: row.active ? "success" : "default", bordered: false, size: "small" },
        { default: () => (row.active ? "Ativo" : "Inativo") }
      ),
  },
  {
    title: "Ultimo uso",
    key: "last_used_at",
    render: (row) => formatDateTime(row.last_used_at),
  },
  {
    title: "Expira em",
    key: "expires_at",
    render: (row) => formatDateTime(row.expires_at),
  },
  {
    title: "Acoes",
    key: "actions",
    align: "right",
    render: (row) =>
      h("div", { style: "display:flex;justify-content:flex-end;gap:8px;" }, [
        h(
          NButton,
          { size: "small", onClick: () => openEdit(row) },
          { default: () => "Editar" }
        ),
        h(
          NButton,
          { size: "small", type: "error", ghost: true, onClick: () => removeItem(row) },
          { default: () => "Excluir" }
        ),
      ]),
  },
]);

function resetForm() {
  form.name = "";
  form.description = "";
  form.active = true;
  form.client_key = "";
  form.owner_user_id = null;
  form.expires_at = null;
  form.permission_keys = [];
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

async function fetchItems() {
  loading.value = true;
  try {
    const data = await api("/settings/api-clients");
    items.value = data.items || [];
  } catch (err) {
    message.error(err.message || "Falha ao listar API clients");
  } finally {
    loading.value = false;
  }
}

async function fetchPermissionOptions() {
  const data = await api("/settings/permissions");
  permissionOptions.value = (data.items || []).map((item) => ({
    value: item.key,
    label: item.description ? `${item.key} - ${item.description}` : item.key,
  }));
}

async function fetchOwnerOptions() {
  const data = await api("/settings/api-clients/owners");
  ownerOptions.value = (data.items || []).map((item) => ({
    value: item.id,
    label: item.email ? `${item.name} - ${item.email}` : item.name,
  }));
}

async function loadCatalogs() {
  try {
    await Promise.all([fetchPermissionOptions(), fetchOwnerOptions()]);
  } catch (err) {
    message.error(err.message || "Falha ao carregar opcoes");
  }
}

function openCreate() {
  resetForm();
  formModal.id = null;
  formModal.isEdit = false;
  formModal.show = true;
}

function openEdit(item) {
  resetForm();
  formModal.id = item.id;
  formModal.isEdit = true;
  formModal.show = true;
  form.name = item.name || "";
  form.description = item.description || "";
  form.active = !!item.active;
  form.client_key = item.client_key || "";
  form.owner_user_id = item.owner_user_id || null;
  form.expires_at = item.expires_at ? new Date(item.expires_at).getTime() : null;
  form.permission_keys = Array.isArray(item.permissions) ? [...item.permissions] : [];
}

function closeFormModal() {
  formModal.show = false;
}

function validateForm() {
  if (!form.name.trim()) return "Informe o nome do API client";
  return null;
}

function buildPayload() {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    active: !!form.active,
    owner_user_id: form.owner_user_id || null,
    expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    permission_keys: [...new Set(form.permission_keys || [])],
  };
}

async function submitForm() {
  const validationError = validateForm();
  if (validationError) {
    message.warning(validationError);
    return;
  }

  saving.value = true;
  try {
    const payload = buildPayload();
    if (formModal.isEdit) {
      const data = await api(`/settings/api-clients/${encodeURIComponent(formModal.id)}`, {
        method: "PUT",
        body: payload,
      });
      message.success("API client atualizado");
      const updated = data?.api_client;
      if (updated) {
        items.value = items.value.map((item) => (item.id === updated.id ? updated : item));
      }
    } else {
      const data = await api("/settings/api-clients", {
        method: "POST",
        body: payload,
      });
      const created = data?.api_client;
      message.success("API client criado");
      if (created) {
        secretModal.clientKey = created.client_key || "";
        secretModal.clientSecret = created.client_secret || "";
        secretModal.show = true;
      }
    }

    formModal.show = false;
    await fetchItems();
  } catch (err) {
    message.error(err.message || "Falha ao salvar API client");
  } finally {
    saving.value = false;
  }
}

async function rotateSecret() {
  if (!formModal.id) return;
  const ok = window.confirm("Rotacionar o segredo deste API client?");
  if (!ok) return;

  rotatingSecret.value = true;
  try {
    const data = await api(`/settings/api-clients/${encodeURIComponent(formModal.id)}/rotate-secret`, {
      method: "POST",
    });
    secretModal.clientKey = data?.api_client?.client_key || form.client_key || "";
    secretModal.clientSecret = data?.client_secret || "";
    secretModal.show = true;
    message.success("Segredo rotacionado");
    await fetchItems();
  } catch (err) {
    message.error(err.message || "Falha ao rotacionar segredo");
  } finally {
    rotatingSecret.value = false;
  }
}

async function removeItem(item) {
  const ok = window.confirm(`Excluir o API client ${item.name}?`);
  if (!ok) return;

  try {
    await api(`/settings/api-clients/${encodeURIComponent(item.id)}`, {
      method: "DELETE",
    });
    message.success("API client excluido");
    await fetchItems();
  } catch (err) {
    message.error(err.message || "Falha ao excluir API client");
  }
}

onMounted(async () => {
  await Promise.all([loadCatalogs(), fetchItems()]);
});
</script>
