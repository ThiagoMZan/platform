<template>
  <n-space vertical :size="16">
    <n-card :title="isEdit ? 'Editar Usuario' : 'Novo Usuario'">
      <n-form ref="formRef" :model="form" :rules="rules" label-placement="top" @submit.prevent="submit">
        <n-grid :cols="2" :x-gap="12">
          <n-form-item-gi label="name" path="name">
            <n-input v-model:value="form.name" />
          </n-form-item-gi>

          <n-form-item-gi label="email" path="email">
            <n-input v-model:value="form.email" type="email" />
          </n-form-item-gi>

          <n-form-item-gi label="password" path="password">
            <n-input
              v-model:value="form.password"
              type="password"
              show-password-on="click"
              placeholder="Deixe vazio para manter"
            />
          </n-form-item-gi>

          <n-form-item-gi label="inactive" path="inactive">
            <n-checkbox v-model:checked="form.inactive">inactive = true</n-checkbox>
          </n-form-item-gi>
        </n-grid>

        <n-space justify="space-between">
          <n-space>
            <n-button @click="goBack">Voltar</n-button>
            <n-button v-if="isEdit && canDelete" type="error" @click="removeUser">Excluir</n-button>
          </n-space>

          <n-button type="primary" attr-type="submit" :loading="loading">Salvar</n-button>
        </n-space>
      </n-form>
    </n-card>

    <n-card v-if="isEdit && canWrite" title="Grupos (Roles)">
      <n-space vertical>
        <n-checkbox-group v-model:value="roleForm.role_ids">
          <n-grid :cols="2" :x-gap="12" :y-gap="8">
            <n-gi v-for="item in roleCatalog" :key="item.id">
              <n-checkbox :value="item.id">
                <strong>{{ item.key }}</strong> - {{ item.name }}
              </n-checkbox>
            </n-gi>
          </n-grid>
        </n-checkbox-group>

        <n-space justify="end">
          <n-button :loading="rolesLoading" type="primary" @click="saveRoles">
            Salvar grupos
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
const rolesLoading = ref(false);

const form = ref({
  name: "",
  email: "",
  password: "",
  inactive: false,
});

const roleCatalog = ref([]);
const roleForm = ref({ role_ids: [] });

const isEdit = computed(() => route.params.id && route.params.id !== "new");
const canDelete = computed(() => auth.hasPermission("users.delete"));
const canWrite = computed(() => auth.hasPermission("users.write"));

const rules = {
  name: [{ required: true, message: "Informe o nome", trigger: "blur" }],
  email: [{ required: true, message: "Informe o e-mail", trigger: "blur" }],
};

async function loadUser() {
  if (!isEdit.value) return;
  loading.value = true;
  try {
    const data = await api(`/users/${route.params.id}`);
    form.value = {
      name: data.user.name,
      email: data.user.email,
      password: "",
      inactive: data.user.inactive,
    };
  } catch (err) {
    message.error(err.message || "Falha ao carregar usuario");
  } finally {
    loading.value = false;
  }
}

async function loadRoles() {
  if (!isEdit.value || !canWrite.value) return;

  rolesLoading.value = true;
  try {
    const [catalog, userRoles] = await Promise.all([
      api("/roles"),
      api(`/users/${route.params.id}/roles`),
    ]);

    roleCatalog.value = catalog.items || [];
    roleForm.value.role_ids = (userRoles.items || []).map((item) => item.id);
  } catch (err) {
    message.error(err.message || "Falha ao carregar grupos");
  } finally {
    rolesLoading.value = false;
  }
}

async function saveRoles() {
  rolesLoading.value = true;
  try {
    await api(`/users/${route.params.id}/roles`, {
      method: "PUT",
      body: JSON.stringify({ role_ids: roleForm.value.role_ids }),
    });

    if (route.params.id === auth.user?.id) {
      await auth.loadMe();
    }

    message.success("Grupos atualizados");
  } catch (err) {
    message.error(err.message || "Falha ao salvar grupos");
  } finally {
    rolesLoading.value = false;
  }
}

async function submit() {
  await formRef.value?.validate();

  loading.value = true;
  try {
    const payload = {
      name: form.value.name,
      email: form.value.email,
      inactive: form.value.inactive,
    };

    if (form.value.password) payload.password = form.value.password;

    if (isEdit.value) {
      await api(`/users/${route.params.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      message.success("Usuario atualizado");
    } else {
      if (!form.value.password) {
        message.error("Informe a senha para criar usuario");
        return;
      }
      await api("/users", {
        method: "POST",
        body: JSON.stringify({ ...payload, password: form.value.password }),
      });
      message.success("Usuario criado");
    }

    await router.push("/admin/users");
  } catch (err) {
    message.error(err.message || "Falha ao salvar usuario");
  } finally {
    loading.value = false;
  }
}

function removeUser() {
  dialog.warning({
    title: "Excluir usuario",
    content: "Essa acao nao pode ser desfeita.",
    positiveText: "Excluir",
    negativeText: "Cancelar",
    onPositiveClick: async () => {
      try {
        await api(`/users/${route.params.id}`, { method: "DELETE" });
        message.success("Usuario excluido");
        await router.push("/admin/users");
      } catch (err) {
        message.error(err.message || "Falha ao excluir");
      }
    },
  });
}

function goBack() {
  router.push("/admin/users");
}

onMounted(async () => {
  await loadUser();
  await loadRoles();
});
</script>
