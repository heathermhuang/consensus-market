import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/ethers/")) return "ethers-vendor";
          if (id.includes("/react/") || id.includes("/react-dom/")) return "react-vendor";
          if (id.includes("/@walletconnect/") || id.includes("/@reown/")) return "walletconnect-vendor";
          return "vendor";
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
