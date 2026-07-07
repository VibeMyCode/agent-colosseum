import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  base: "/agent-colosseum/",
  plugins: [react(), nodePolyfills()],
  resolve: {
    alias: { "@": "/src" },
  },
});
