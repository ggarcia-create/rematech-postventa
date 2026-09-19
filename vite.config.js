import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
export default defineConfig({
  root: "src",
  envDir: fileURLToPath(new URL(".", import.meta.url)),
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { outDir: "../dist", emptyOutDir: true },
});
