import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../../", "");

  return {
    envDir: "../../",
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: getDevApiProxyTarget(
            env.VITE_API_BASE_URL?.trim(),
            env.APP_BASE_URL?.trim()
          ),
          changeOrigin: true
        }
      }
    }
  };
});

function getDevApiProxyTarget(
  apiBaseUrl: string | undefined,
  appBaseUrl: string | undefined
): string {
  return getOrigin(apiBaseUrl) ?? getOrigin(appBaseUrl) ?? "http://localhost:3000";
}

function getOrigin(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}
