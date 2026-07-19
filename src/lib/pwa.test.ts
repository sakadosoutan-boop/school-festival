import { describe, expect, it } from "vitest";
import { detectInstallPlatform, isStandalone } from "./pwa";

describe("PWA install helpers", () => {
  it("detects iPhone and iPadOS", () => {
    expect(detectInstallPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("ios");
    expect(detectInstallPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", 5)).toBe("ios");
  });

  it("detects Android before other platforms", () => {
    expect(detectInstallPlatform("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36")).toBe("android");
  });

  it("keeps desktop browsers out of the mobile instructions", () => {
    expect(detectInstallPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("other");
  });

  it("recognizes both display-mode and iOS standalone launches", () => {
    expect(isStandalone(true, false)).toBe(true);
    expect(isStandalone(false, true)).toBe(true);
    expect(isStandalone(false, false)).toBe(false);
  });
});
