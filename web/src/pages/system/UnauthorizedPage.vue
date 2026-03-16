<template>
  <div class="status-wrap">
    <n-card class="status-card" :bordered="false">
      <n-result status="error" title="401 - Nao autenticado" description="Sua sessao nao e valida ou expirou.">
        <template #footer>
          <n-space justify="center">
            <n-button @click="goBack">Voltar</n-button>
            <n-button type="primary" @click="goLogin">Ir para login</n-button>
          </n-space>
        </template>
      </n-result>
    </n-card>
  </div>
</template>

<script setup>
import { NButton, NCard, NResult, NSpace } from "naive-ui";
import { useRoute, useRouter } from "vue-router";

const router = useRouter();
const route = useRoute();

function goBack() {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  router.push(route.query.from || "/login");
}

function goLogin() {
  router.push("/login");
}
</script>

<style scoped>
.status-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: linear-gradient(135deg, #f5f7fa 0%, #e6ecf4 100%);
}

.status-card {
  width: 100%;
  max-width: 640px;
}
</style>
