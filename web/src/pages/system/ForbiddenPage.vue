<template>
  <div class="status-wrap">
    <n-card class="status-card" :bordered="false">
      <n-result status="403" title="403 - Sem permissao" description="Voce nao tem permissao para acessar esta area.">
        <template #footer>
          <n-space justify="center">
            <n-button @click="goBack">Voltar</n-button>
            <n-button type="primary" @click="goHome">Ir para inicio</n-button>
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
  router.push(route.query.from || "/home");
}

function goHome() {
  router.push("/home");
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

