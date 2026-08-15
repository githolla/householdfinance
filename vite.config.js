import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// The planner panel calls the Anthropic API. In the browser that would leak the key
// and get blocked by CORS, so dev requests to /api/anthropic are proxied here and the
// key is attached server-side. Swap this for a real backend route before shipping.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api/anthropic": {
          target: "https://api.anthropic.com",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/anthropic/, ""),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader("x-api-key", env.ANTHROPIC_API_KEY || "");
              proxyReq.setHeader("anthropic-version", "2023-06-01");
            });
          },
        },
      },
    },
  };
});
