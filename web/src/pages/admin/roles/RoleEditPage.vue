<template>
  <n-space vertical :size="16">
    <n-card :title="isEdit ? 'Editar Role' : 'Nova Role'">
      <n-form ref="formRef" :model="form" :rules="rules" label-placement="top" @submit.prevent="submit">
        <n-grid :cols="2" :x-gap="12">
          <n-form-item-gi label="key" path="key">
            <n-input v-model:value="form.key" />
          </n-form-item-gi>

          <n-form-item-gi label="name" path="name">
            <n-input v-model:value="form.name" />
          </n-form-item-gi>

          <n-form-item-gi label="description" path="description" :span="2">
            <n-input v-model:value="form.description" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" />
          </n-form-item-gi>

          <n-form-item-gi label="inactive" path="inactive">
            <n-checkbox v-model:checked="form.inactive">inactive = true</n-checkbox>
          </n-form-item-gi>
        </n-grid>

        <n-space justify="space-between">
          <n-space>
            <n-button @click="goBack">Voltar</n-button>
            <n-button v-if="isEdit && canDelete" type="error" @click="removeRole">Excluir</n-button>
          </n-space>
          <n-button type="primary" attr-type="submit" :loading="loading">Salvar</n-button>
        </n-space>
      </n-form>
    </n-card>

    <n-card v-if="isEdit && canWrite" title="Permissoes da Role">
      <n-space vertical>
        <div v-if="groupedPermissionRows.length" class="permissions-matrix">
          <table class="permissions-table">
            <thead>
              <tr>
                <th>Recurso</th>
                <th>access</th>
                <th>read</th>
                <th>write</th>
                <th>delete</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in groupedPermissionRows" :key="row.baseKey">
                <td>
                  <strong>{{ row.baseKey }}</strong>
                </td>
                <td v-for="action in permissionActions" :key="`${row.baseKey}:${action}`" class="permissions-cell">
                  <n-checkbox
                    v-if="row.permissions[action]"
                    :checked="hasPermission(row.permissions[action].key)"
                    @update:checked="setPermission(row.permissions[action].key, $event)"
                  />
                  <span v-else class="permissions-empty">-</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <template v-if="extraPermissionItems.length">
          <strong>Outras permissoes</strong>
          <n-grid :cols="2" :x-gap="12" :y-gap="8">
            <n-gi v-for="item in extraPermissionItems" :key="item.key">
              <n-checkbox
                :checked="hasPermission(item.key)"
                @update:checked="setPermission(item.key, $event)"
              >
                <strong>{{ item.key }}</strong>
                <template v-if="item.description"> - {{ item.description }}</template>
              </n-checkbox>
            </n-gi>
          </n-grid>
        </template>

        <n-space justify="end">
          <n-button type="primary" :loading="permissionsLoading" @click="savePermissions">
            Salvar permissoes
          </n-button>
        </n-space>
      </n-space>
    </n-card>
  </n-space>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  NButton,
  NCard,
  NCheckbox,
  NCheckboxGroup,
  NForm,
  NFormItemGi,
  NGi,
  NGrid,
  NInput,
  NSpace,
  useDialog,
  useMessage,
} from "naive-ui";
import { api } from "../../../services/api";
import { useAuthStore } from "../../../stores/auth";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const message = useMessage();
const dialog = useDialog();

const formRef = ref();
const loading = ref(false);
const permissionsLoading = ref(false);

const form = ref({ key: "", name: "", description: "", inactive: false });
const permissionCatalog = ref([]);
const permissionForm = ref({ permissions: [] });
const permissionActions = ["access", "read", "write", "delete"];

const isEdit = computed(() => route.params.id && route.params.id !== "new");
const canWrite = computed(() => auth.hasPermission("roles.write"));
const canDelete = computed(() => auth.hasPermission("roles.delete"));
const permissionSet = computed(() => new Set(permissionForm.value.permissions || []));

const groupedPermissionRows = computed(() => {
  const rows = new Map();

  for (const item of permissionCatalog.value) {
    const key = String(item?.key || "");
    const segments = key.split(".");
    const action = segments.at(-1);
    if (!permissionActions.includes(action) || segments.length < 2) continue;

    const baseKey = segments.slice(0, -1).join(".");
    if (!rows.has(baseKey)) {
      rows.set(baseKey, {
        baseKey,
        permissions: {
          access: null,
          read: null,
          write: null,
          delete: null,
        },
      });
    }

    rows.get(baseKey).permissions[action] = item;
  }

  return Array.from(rows.values()).sort((a, b) => a.baseKey.localeCompare(b.baseKey));
});

const extraPermissionItems = computed(() =>
  permissionCatalog.value
    .filter((item) => {
      const key = String(item?.key || "");
      const segments = key.split(".");
      const action = segments.at(-1);
      return !permissionActions.includes(action) || segments.length < 2;
    })
    .sort((a, b) => String(a.key || "").localeCompare(String(b.key || "")))
);

const rules = {
  key: [{ required: true, message: "Informe a key", trigger: "blur" }],
  name: [{ required: true, message: "Informe o nome", trigger: "blur" }],
};

function hasPermission(key) {
  return permissionSet.value.has(key);
}

function setPermission(key, checked) {
  const next = new Set(permissionForm.value.permissions || []);
  if (checked) next.add(key);
  else next.delete(key);
  permissionForm.value.permissions = Array.from(next).sort();
}

async function loadRole() {
  if (!isEdit.value) return;
  loading.value = true;
  try {
    const data = await api(`/roles/${route.params.id}`);
    form.value = {
      key: data.role.key,
      name: data.role.name,
      description: data.role.description || "",
      inactive: data.role.inactive,
    };
  } catch (err) {
    message.error(err.message || "Falha ao carregar role");
  } finally {
    loading.value = false;
  }
}

async function loadPermissions() {
  if (!isEdit.value || !canWrite.value) return;
  permissionsLoading.value = true;
  try {
    const [catalog, rolePerms] = await Promise.all([
      api("/permissions"),
      api(`/roles/${route.params.id}/permissions`),
    ]);
    permissionCatalog.value = catalog.items || [];
    permissionForm.value.permissions = rolePerms.permissions || [];
  } catch (err) {
    message.error(err.message || "Falha ao carregar permissoes");
  } finally {
    permissionsLoading.value = false;
  }
}

async function savePermissions() {
  permissionsLoading.value = true;
  try {
    await api(`/roles/${route.params.id}/permissions`, {
      method: "PUT",
      body: JSON.stringify({ permissions: permissionForm.value.permissions }),
    });
    message.success("Permissoes da role atualizadas");
  } catch (err) {
    message.error(err.message || "Falha ao salvar permissoes");
  } finally {
    permissionsLoading.value = false;
  }
}

async function submit() {
  await formRef.value?.validate();
  loading.value = true;
  try {
    const payload = {
      key: form.value.key,
      name: form.value.name,
      description: form.value.description || null,
      inactive: form.value.inactive,
    };

    if (isEdit.value) {
      await api(`/roles/${route.params.id}`, { method: "PUT", body: JSON.stringify(payload) });
      message.success("Role atualizada");
    } else {
      await api("/roles", { method: "POST", body: JSON.stringify(payload) });
      message.success("Role criada");
    }

    await router.push("/admin/roles");
  } catch (err) {
    message.error(err.message || "Falha ao salvar role");
  } finally {
    loading.value = false;
  }
}

function removeRole() {
  dialog.warning({
    title: "Excluir role",
    content: "Essa acao nao pode ser desfeita.",
    positiveText: "Excluir",
    negativeText: "Cancelar",
    onPositiveClick: async () => {
      try {
        await api(`/roles/${route.params.id}`, { method: "DELETE" });
        message.success("Role excluida");
        await router.push("/admin/roles");
      } catch (err) {
        message.error(err.message || "Falha ao excluir role");
      }
    },
  });
}

function goBack() {
  router.push("/admin/roles");
}

onMounted(async () => {
  await loadRole();
  await loadPermissions();
});
</script>

<style scoped>
.permissions-matrix {
  overflow-x: auto;
}

.permissions-table {
  width: 100%;
  border-collapse: collapse;
}

.permissions-table th,
.permissions-table td {
  padding: 10px 12px;
  border-bottom: 1px solid rgb(239, 239, 245);
  text-align: center;
}

.permissions-table th:first-child,
.permissions-table td:first-child {
  text-align: left;
}

.permissions-cell {
  width: 90px;
}

.permissions-empty {
  color: rgb(160, 160, 170);
}
</style>

