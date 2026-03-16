export const coreHookHandlers = {
  "core.normalizeEmail": async (ctx) => {
    if (!ctx?.data || typeof ctx.data !== "object") return;
    if (ctx.data.email && typeof ctx.data.email === "string") {
      ctx.data.email = ctx.data.email.trim().toLowerCase();
    }
  },

  "core.setUpdatedAt": async (ctx) => {
    if (!ctx?.data || typeof ctx.data !== "object") return;
    ctx.data.updated_at = new Date().toISOString();
  },
};

export function registerCoreHooks(hookBus) {
  hookBus.registerHookMap(coreHookHandlers, {
    source: "core",
    unique: true,
  });
}

export async function runHooks({ names = [], ctx, hookBus, eventNames = [] }) {
  for (const eventName of eventNames) {
    await hookBus.trigger(eventName, ctx, { source: "forms-engine" });
  }

  for (const name of names) {
    await hookBus.trigger(name, ctx, { source: "forms-schema" });
  }
}
