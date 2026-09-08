import { defineConfig } from "vite";
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:4318",
      "/media": "http://127.0.0.1:4318",
      "/exports": "http://127.0.0.1:4318",
    },
  },
});
