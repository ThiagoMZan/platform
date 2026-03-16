<template>
  <n-space vertical :size="16">
    <n-card title="Settings - Geral">
      <n-space vertical>
        <n-alert type="info" :show-icon="false">
          Configure os parametros globais do core.
        </n-alert>

        <n-form label-placement="left" label-width="220" style="max-width: 560px">
          <n-form-item label="Sessao ativa (minutos)">
            <n-input-number
              v-model:value="sessionTtlMinutes"
              :min="5"
              :max="1440"
              :step="5"
              :disabled="loading"
              style="width: 160px"
            />
          </n-form-item>

          <n-form-item label="Idioma da plataforma">
            <n-select
              v-model:value="locale"
              :options="localeOptions"
              :disabled="loading"
              style="width: 220px"
            />
          </n-form-item>

          <n-form-item label="Nivel de log">
            <n-select
              v-model:value="logLevel"
              :options="logLevelOptions"
              :disabled="loading"
              style="width: 220px"
            />
          </n-form-item>
        </n-form>

        <n-space>
          <n-button type="primary" :loading="saving" :disabled="loading" @click="saveGeneralSettings">
            Salvar
          </n-button>
          <n-button :loading="loading" @click="loadGeneralSettings">Recarregar</n-button>
        </n-space>
      </n-space>
    </n-card>

    <n-card title="Acesso rapido">
      <n-space>
        <n-button type="primary" @click="goPermissions">
          Gerenciar permissoes
        </n-button>
        <n-button @click="goSessions">
          Sessoes ativas
        </n-button>
        <n-button @click="goModules">Modulos instalados</n-button>
        <n-button @click="goApiClients">API Clients</n-button>
        <n-button @click="goVersioning">Versionamento de forms</n-button>
      </n-space>
    </n-card>
  </n-space>
</template>

<script setup>
import { h, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  NAlert,
  NButton,
  NCard,
  NForm,
  NFormItem,
  NInputNumber,
  NSelect,
  NSpace,
  NText,
  useMessage,
} from "naive-ui";
import { api } from "../../services/api";
const router = useRouter();
const message = useMessage();

const loading = ref(false);
const saving = ref(false);
const sessionTtlMinutes = ref(30);
const locale = ref("pt_BR");
const logLevel = ref("error");

const supportedLocales = [
  { value: "pt_BR", label: "Português (Brasil)", flag: "🇧🇷" },
  { value: "en_US", label: "English (United States)", flag: "🇺🇸" },
];

const localeOptions = supportedLocales.map((item) => ({
  value: item.value,
  label: item.label,
  flag: item.flag,
  renderLabel: () =>
    h(NSpace, { size: 8, align: "center" }, () => [
      h("span", { class: "locale-flag" }, item.flag),
      h(NText, null, { default: () => item.label }),
    ]),
}));

const logLevelOptions = [
  { value: "trace", label: "trace" },
  { value: "debug", label: "debug" },
  { value: "info", label: "info" },
  { value: "warn", label: "warn" },
  { value: "error", label: "error" },
  { value: "fatal", label: "fatal" },
];

async function loadGeneralSettings() {
  loading.value = true;
  try {
    const data = await api("/settings/general");
    sessionTtlMinutes.value = Number(data?.settings?.session_ttl_minutes || 30);
    locale.value = data?.settings?.locale || "pt_BR";
    logLevel.value = data?.settings?.log_level || "error";
  } catch (err) {
    message.error(err.message || "Falha ao carregar configuracoes");
  } finally {
    loading.value = false;
  }
}

async function saveGeneralSettings() {
  const value = Number(sessionTtlMinutes.value);
  if (!Number.isFinite(value) || value < 5 || value > 1440) {
    message.warning("Informe um valor entre 5 e 1440 minutos");
    return;
  }

  if (!supportedLocales.some((item) => item.value === locale.value)) {
    message.warning("Selecione um idioma valido");
    return;
  }

  if (!logLevelOptions.some((item) => item.value === logLevel.value)) {
    message.warning("Selecione um nivel de log valido");
    return;
  }

  saving.value = true;
  try {
    const data = await api("/settings/general", {
      method: "PUT",
      body: {
        session_ttl_minutes: Math.floor(value),
        locale: locale.value,
        log_level: logLevel.value,
      },
    });

    sessionTtlMinutes.value = Number(data?.settings?.session_ttl_minutes || Math.floor(value));
    locale.value = data?.settings?.locale || locale.value;
    logLevel.value = data?.settings?.log_level || logLevel.value;
    message.success("Configuracoes salvas");
  } catch (err) {
    message.error(err.message || "Falha ao salvar configuracoes");
  } finally {
    saving.value = false;
  }
}

function goPermissions() {
  router.push("/settings/permissions");
}

function goSessions() {
  router.push("/settings/sessions");
}

function goModules() {
  router.push("/settings/modules");
}

function goApiClients() {
  router.push("/settings/api-clients");
}

function goVersioning() {
  router.push("/settings/versioning");
}

onMounted(loadGeneralSettings);
</script>

<style scoped>
.locale-flag {
  font-size: 16px;
  line-height: 1;
}
</style>
