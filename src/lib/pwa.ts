import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type InstallPlatform = "ios" | "android" | "other";
export type InstallResult = "accepted" | "dismissed" | "manual" | "installed";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

export function detectInstallPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  const ua = userAgent.toLowerCase();
  if (ua.includes("android")) return "android";
  if (/iphone|ipad|ipod/.test(ua) || (ua.includes("macintosh") && maxTouchPoints > 1)) return "ios";
  return "other";
}

export function isStandalone(displayModeStandalone: boolean, navigatorStandalone = false): boolean {
  return displayModeStandalone || navigatorStandalone;
}

function readStandalone(): boolean {
  const displayModeStandalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const navigatorStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return isStandalone(displayModeStandalone, navigatorStandalone);
}

export function usePwaInstall(): {
  platform: InstallPlatform;
  installed: boolean;
  promptAvailable: boolean;
  shouldShow: boolean;
  requestInstall: () => Promise<InstallResult>;
} {
  const platform = useMemo(
    () => detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints),
    [],
  );
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [promptAvailable, setPromptAvailable] = useState(false);
  const [installed, setInstalled] = useState(readStandalone);

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const onPrompt = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent;
      promptEvent.preventDefault();
      promptRef.current = promptEvent;
      setPromptAvailable(true);
    };
    const onInstalled = () => {
      promptRef.current = null;
      setPromptAvailable(false);
      setInstalled(true);
    };
    const onDisplayMode = () => setInstalled(readStandalone());

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    media.addEventListener?.("change", onDisplayMode);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      media.removeEventListener?.("change", onDisplayMode);
    };
  }, []);

  const requestInstall = useCallback(async (): Promise<InstallResult> => {
    if (readStandalone()) {
      setInstalled(true);
      return "installed";
    }
    const prompt = promptRef.current;
    if (!prompt) return "manual";
    await prompt.prompt();
    const choice = await prompt.userChoice;
    promptRef.current = null;
    setPromptAvailable(false);
    if (choice.outcome === "accepted") setInstalled(true);
    return choice.outcome;
  }, []);

  return {
    platform,
    installed,
    promptAvailable,
    shouldShow: !installed && (platform !== "other" || promptAvailable),
    requestInstall,
  };
}

/**
 * アプリを確実に最新版へ入れ替える。
 * 通常はService Workerが自動で更新するが、当日の朝に全端末を確実に揃えたいときや、
 * 古い版が残って表示が直らないときの最後の手段として使う。
 *
 * 消すのはService Workerのキャッシュ(配信ファイル)と、サーバーから取り直せる
 * 表示用キャッシュだけ。お気に入り・スタンプ・テーマなどの端末内の記録は残す。
 */
export async function forceUpdate(): Promise<void> {
  try {
    localStorage.removeItem("machitime:v6:cache");
  } catch { /* 消せなくても読み込み直しは続行する */ }
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
  } catch { /* 権限やプライベートモードで失敗しても、下の再読み込みは行う */ }
  window.location.reload();
}
