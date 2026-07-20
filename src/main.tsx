import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

console.info(`まちたいむ build ${__BUILD_ID__}`);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        // 開きっぱなしのPWAでも新しい配信に気づけるよう、復帰時と定期で更新を確認する
        const check = () => void reg.update().catch(() => undefined);
        document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
        window.setInterval(check, 30 * 60_000);
      })
      .catch(() => undefined);

    // 新しいService Workerが有効化されたら一度だけ再読込し、古い画面のまま
    // 使い続けて「直したはずのバグが出る」状態を防ぐ。初回インストールでは何もしない。
    let hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController) { hadController = true; return; }
      window.location.reload();
    });
  });
}
