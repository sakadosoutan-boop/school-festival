/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FESTIVAL_API_URL?: string;
  readonly VITE_FESTIVAL_PUBLIC_KEY?: string;
  readonly VITE_FESTIVAL_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
