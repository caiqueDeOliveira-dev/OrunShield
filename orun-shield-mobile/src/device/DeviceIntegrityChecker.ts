import type { DeviceIntegrityResult } from "../types.js";

/**
 * Wrapper fino sobre `jail-monkey` (lib nativa consolidada para detecção
 * de root/jailbreak em React Native — é o que apps bancários usam).
 * Não reimplementa a detecção nativa, só padroniza o formato de saída
 * no vocabulário do Shield e adiciona a lógica de "isCompromised" combinada.
 *
 * Import de `jail-monkey` é dinâmico (`await import`) para que este módulo
 * possa ser testado em ambiente Node puro (Vitest) sem precisar de um
 * runtime React Native real — jail-monkey só funciona dentro do app mobile.
 */
export class DeviceIntegrityChecker {
  /** Injeção de dependência para teste — em produção, deixe undefined e o módulo real é carregado. */
  constructor(private readonly jailMonkeyOverride?: JailMonkeyLike, private readonly platformOverride?: "android" | "ios") {}

  async check(): Promise<DeviceIntegrityResult> {
    const jailMonkey = this.jailMonkeyOverride ?? (await this.loadJailMonkey());
    const platform = this.platformOverride ?? this.detectPlatform();

    const broken = jailMonkey.isJailBroken();
    const isRooted = broken && platform === "android";
    const isJailbroken = broken && platform === "ios";
    const isDebuggedMode = await jailMonkey.isDebuggedMode();
    const isOnExternalStorage = jailMonkey.isOnExternalStorage();
    const hookDetected = jailMonkey.hookDetected();

    return {
      isCompromised: isRooted || isJailbroken || hookDetected,
      isRooted,
      isJailbroken,
      isDebuggedMode,
      isOnExternalStorage,
      hookDetected,
      checkedAt: new Date().toISOString(),
    };
  }

  private detectPlatform(): "android" | "ios" {
    // Em produção real, isso é substituído por `Platform.OS` do react-native
    // no ponto de instanciação do checker (ver README) — mantido simples
    // aqui para que o módulo core continue testável em Node puro.
    return (process.env.ORUN_PLATFORM_OVERRIDE as "android" | "ios") ?? "android";
  }

  private async loadJailMonkey(): Promise<JailMonkeyLike> {
    const mod = await import("jail-monkey");
    return mod.default as unknown as JailMonkeyLike;
  }
}

/** Superfície mínima de `jail-monkey` que este módulo usa — evita acoplar ao tipo completo da lib. */
export interface JailMonkeyLike {
  isJailBroken(): boolean;
  isDebuggedMode(): Promise<boolean> | boolean;
  isOnExternalStorage(): boolean;
  hookDetected(): boolean;
}
