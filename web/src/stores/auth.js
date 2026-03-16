import { defineStore } from "pinia";
import { api } from "../services/api";

export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: null,
    checked: false,
  }),

  getters: {
    isAuthenticated: (state) => !!state.user,
    isSuperUser: (state) => {
      const permissions = state.user?.permissions || [];
      return permissions.includes("*");
    },
  },

  actions: {
    hasPermission(permissionKey) {
      const permissions = this.user?.permissions || [];
      if (!permissionKey) return true;
      if (permissions.includes("*")) return true;
      return permissions.includes(permissionKey);
    },

    hasAnyPermission(permissionKeys = []) {
      if (!Array.isArray(permissionKeys) || !permissionKeys.length) return true;
      return permissionKeys.some((key) => this.hasPermission(key));
    },

    async loadMe() {
      try {
        const data = await api("/auth/me");
        this.user = data.user;
      } catch {
        this.user = null;
      } finally {
        this.checked = true;
      }
    },

    async login(payload) {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await this.loadMe();
      return this.user;
    },

    async logout() {
      await api("/auth/logout", { method: "POST" });
      this.user = null;
      this.checked = true;
    },
  },
});
