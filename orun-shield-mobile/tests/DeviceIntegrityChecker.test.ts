import { describe, it, expect } from "vitest";
import { DeviceIntegrityChecker, type JailMonkeyLike } from "../src/device/DeviceIntegrityChecker.js";

function fakeJailMonkey(overrides: Partial<JailMonkeyLike> = {}): JailMonkeyLike {
  return {
    isJailBroken: () => false,
    isDebuggedMode: () => false,
    isOnExternalStorage: () => false,
    hookDetected: () => false,
    ...overrides,
  };
}

describe("DeviceIntegrityChecker", () => {
  it("considera dispositivo íntegro quando nada é detectado", async () => {
    const checker = new DeviceIntegrityChecker(fakeJailMonkey(), "android");
    const result = await checker.check();
    expect(result.isCompromised).toBe(false);
  });

  it("marca isRooted em vez de isJailbroken quando a plataforma é android", async () => {
    const checker = new DeviceIntegrityChecker(fakeJailMonkey({ isJailBroken: () => true }), "android");
    const result = await checker.check();
    expect(result.isRooted).toBe(true);
    expect(result.isJailbroken).toBe(false);
    expect(result.isCompromised).toBe(true);
  });

  it("marca isJailbroken em vez de isRooted quando a plataforma é ios", async () => {
    const checker = new DeviceIntegrityChecker(fakeJailMonkey({ isJailBroken: () => true }), "ios");
    const result = await checker.check();
    expect(result.isJailbroken).toBe(true);
    expect(result.isRooted).toBe(false);
  });

  it("considera comprometido quando hookDetected é true mesmo sem root/jailbreak", async () => {
    const checker = new DeviceIntegrityChecker(fakeJailMonkey({ hookDetected: () => true }), "android");
    const result = await checker.check();
    expect(result.isCompromised).toBe(true);
    expect(result.hookDetected).toBe(true);
  });
});
