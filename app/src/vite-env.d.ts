/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Verification only. See developmentConnection in api.ts. */
  readonly VITE_SPARRING_PORT?: string;
  readonly VITE_SPARRING_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
