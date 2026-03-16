<template>
  <div class="home-redirect">
    <n-spin size="large" />
  </div>
</template>

<script setup>
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { NSpin } from "naive-ui";
import { useAuthStore } from "../../stores/auth";
import { getDefaultPortalPath } from "../../services/portalNavigation";

const router = useRouter();
const auth = useAuthStore();

onMounted(async () => {
  const target = await getDefaultPortalPath(auth);
  router.replace(target);
});
</script>

<style scoped>
.home-redirect {
  min-height: calc(100vh - 56px);
  display: grid;
  place-items: center;
}
</style>
