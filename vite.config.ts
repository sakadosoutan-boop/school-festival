import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// どの端末がどの版を動かしているか一目で分かるよう、ビルド日時(JST)を埋め込む。
// ヘルプ・設定画面の下部に表示され、キャッシュ起因の不具合切り分けに使う。
const buildId = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ") + " JST";

export default defineConfig({
  base: "/school-festival/",
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
