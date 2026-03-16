/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __OPENCASHIER_RUNTIME_CONFIG__?: {
    API_BASE_URL?: string;
  };
}
