import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// The planner and receipt reading call the Anthropic API. In the browser that would
// leak the key and get blocked by CORS, so dev requests to /api/anthropic are proxied
// here and the key is attached server-side.
//
// This block is dev-only — `server.proxy` does not exist in a built site. Production
// is served by the matching serverless function in api/anthropic/[...path].js. Change
// one and change the other, or the app works in dev and 404s once deployed.
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
