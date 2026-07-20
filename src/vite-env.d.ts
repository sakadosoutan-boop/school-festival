/// <reference types="vite/client" />

// vite.config.ts の define で注入されるビルド日時
declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  readonly VITE_FESTIVAL_API_URL?: string;
  readonly VITE_FESTIVAL_PUBLIC_KEY?: string;
  readonly VITE_FESTIVAL_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
