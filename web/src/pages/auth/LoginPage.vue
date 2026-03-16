<template>
  <div class="login-wrap">
    <n-card title="Acesso ao Portal" class="card">
      <n-form :model="form" :rules="rules" ref="formRef" @submit.prevent="submit">
        <n-form-item path="email" label="E-mail">
          <n-input v-model:value="form.email" placeholder="admin@example.com" />
        </n-form-item>

        <n-form-item path="password" label="Senha">
          <n-input v-model:value="form.password" type="password" show-password-on="click" />
        </n-form-item>

        <n-space justify="end">
          <n-button type="primary" :loading="loading" attr-type="submit">Entrar</n-button>
        </n-space>
      </n-form>
    </n-card>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useMessage, NCard, NForm, NFormItem, NInput, NSpace, NButton } from "naive-ui";
import { useAuthStore } from "../../stores/auth";

const auth = useAuthStore();
const router = useRouter();
const message = useMessage();

const formRef = ref();
const loading = ref(false);
const form = ref({
  email: "admin@example.com",
  password: "Admin@12345",
});

const rules = {
  email: [{ required: true, message: "Informe o e-mail", trigger: "blur" }],
  password: [{ required: true, message: "Informe a senha", trigger: "blur" }],
};

async function submit() {
  await formRef.value?.validate();
  loading.value = true;
  try {
    await auth.login(form.value);
    message.success("Login realizado");
    await router.push("/home");
  } catch (err) {
    message.error(err.message || "Falha no login");
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: linear-gradient(130deg, #eef4ff, #edf9f2);
}

.card {
  width: min(420px, calc(100vw - 32px));
}
</style>

