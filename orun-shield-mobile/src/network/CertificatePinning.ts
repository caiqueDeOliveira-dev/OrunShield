/**
 * Wrapper sobre `react-native-ssl-public-key-pinning` (OkHttp CertificatePinner
 * no Android, TrustKit no iOS — não reimplementa pinning, orquestra a lib
 * já madura). Protege as chamadas do app para Supabase/Edge Functions contra
 * ataques MITM (ex: numa rede Wi-Fi pública comprometida).
 *
 * IMPORTANTE — limitações reais que precisam estar claras antes de usar:
 *  1. NÃO funciona no Expo Go — exige um development build ou production
 *     build (`npx expo run:ios` / `npx expo run:android` / EAS Build),
 *     porque a lib tem código nativo.
 *  2. No iOS, o "Network Inspector" do expo-dev-client interfere com o
 *     pinning — precisa ser desabilitado via `expo-build-properties` (ver
 *     README) em builds de desenvolvimento. Em produção isso já vem
 *     desabilitado automaticamente.
 *  3. Pins (hashes de chave pública) EXPIRAM quando o certificado do
 *     servidor é renovado. Um app com pins desatualizados simplesmente
 *     para de conseguir falar com o backend — por isso é essencial
 *     sempre configurar um pin de backup (chave de renovação) e ter um
 *     plano de atualização via OTA (EAS Update) antes do certificado trocar.
 */
export interface DomainPinningConfig {
  includeSubdomains?: boolean;
  /** Hashes SHA-256 (base64) da Subject Public Key Info do certificado. Ver README para como extrair. */
  publicKeyHashes: string[];
  /**
   * Data (yyyy-MM-dd) em que os pins expiram e a validação é desativada
   * automaticamente — evita que o app fique travado pra sempre se não
   * receber atualização antes do certificado do servidor ser renovado.
   * Fortemente recomendado definir sempre.
   */
  expirationDate?: string;
}

export type CertificatePinningConfig = Record<string, DomainPinningConfig>;

export interface CertificatePinningResult {
  initialized: boolean;
  error?: string;
}

/**
 * Injeção de dependência da função real da lib — permite testar este
 * wrapper em Node puro (Vitest) sem precisar de um runtime React Native,
 * já que `react-native-ssl-public-key-pinning` só funciona dentro do app.
 */
export type InitializeSslPinningFn = (config: CertificatePinningConfig) => Promise<void>;

export class CertificatePinningManager {
  private initialized = false;

  constructor(
    private readonly initializeSslPinningOverride?: InitializeSslPinningFn,
    private readonly isAvailableOverride?: () => boolean
  ) {}

  /**
   * Verifica se o módulo nativo está disponível — retorna `false` no Expo
   * Go (sem custom dev build) sem lançar exceção. Útil pra decidir se vale
   * a pena tentar `initialize()` ou só logar um aviso de dev.
   */
  async isAvailable(): Promise<boolean> {
    const fn = this.isAvailableOverride ?? (await this.loadIsAvailable());
    return fn();
  }

  /**
   * Chamar uma única vez, o mais cedo possível no ciclo de vida do app
   * (ex: no topo do componente raiz, antes de qualquer chamada de rede
   * para os domínios pinados).
   */
  async initialize(config: CertificatePinningConfig): Promise<CertificatePinningResult> {
    if (this.initialized) {
      return { initialized: true };
    }

    try {
      const fn = this.initializeSslPinningOverride ?? (await this.loadRealImplementation());
      await fn(config);
      this.initialized = true;
      return { initialized: true };
    } catch (err) {
      // Falha na inicialização do pinning não deve derrubar o app inteiro —
      // mas o app FICA SEM a proteção. Vale logar isso com destaque e,
      // dependendo da política de segurança, bloquear funcionalidades sensíveis.
      return { initialized: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private async loadIsAvailable(): Promise<() => boolean> {
    const mod = (await import("react-native-ssl-public-key-pinning")) as {
      isSslPinningAvailable: () => boolean;
    };
    return mod.isSslPinningAvailable;
  }

  private async loadRealImplementation(): Promise<InitializeSslPinningFn> {
    const mod = (await import("react-native-ssl-public-key-pinning")) as {
      initializeSslPinning: InitializeSslPinningFn;
    };
    return mod.initializeSslPinning;
  }
}

/**
 * Monta a config de pinning para os domínios do ecossistema Orun a partir
 * de hashes já extraídos (ver README, seção "Como extrair os pins").
 * Centraliza aqui em vez de espalhar strings mágicas pelo app.
 */
export function buildOrunPinningConfig(params: {
  supabaseProjectHost: string; // ex: "xxxxx.supabase.co"
  supabasePublicKeyHashes: string[]; // sempre incluir pelo menos 2: o atual + o de backup/renovação
}): CertificatePinningConfig {
  return {
    [params.supabaseProjectHost]: {
      includeSubdomains: true,
      publicKeyHashes: params.supabasePublicKeyHashes,
    },
  };
}
