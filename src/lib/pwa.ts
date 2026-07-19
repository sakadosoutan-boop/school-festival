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
