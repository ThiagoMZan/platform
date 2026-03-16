import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";

export default defineConfig({
  plugins: [vue()],
  server: {
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
  },
});
