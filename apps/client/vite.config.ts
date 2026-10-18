import { defineConfig } from "vite";

export default defineConfig({
  server: { host: true, port: 5173 },
  // host: true so a phone on the same Wi-Fi can open the preview build.
  preview: { host: true, port: 4173, strictPort: true },
});
