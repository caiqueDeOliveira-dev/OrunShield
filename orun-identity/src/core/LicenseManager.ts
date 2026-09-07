import { importSPKI, jwtVerify, type KeyLike } from 'jose';
import type { ISecureTokenStore } from '../storage/ISecureTokenStore';
import { TOKEN_STORE_KEYS } from '../storage/ISecureTokenStore';
import type { LicensePayload, LicenseValidationResult } from '../types';

const DEFAULT_GRACE_PERIOD_DAYS = 3;

export interface LicenseManagerConfig {
  tokenStore: ISecureTokenStore;
  /**
   * Chave pública (formato SPKI PEM) usada para verificar a assinatura
   * localmente, sem rede. Não é segredo — pode ser embutida no bundle do
   * app. A chave privada correspondente só existe na Edge Function
   * `issue-license` (Supabase secret).
   */
  publicKeyPem: string;
  /** Dias de tolerância offline após expiresAt antes de degradar o app. Default: 3. */
  gracePeriodDays?: number;
  /**
   * Função que chama a Edge Function `issue-license` para renovar o token.
   * Deve retornar o JWT assinado em texto puro. Lançar erro se offline —
   * o LicenseManager trata isso como "sem rede" e cai no grace period.
   */
  fetchFreshLicense: () => Promise<string>;
}

/**
 * Gerencia o ciclo de vida da licença offline no Desktop/TV: cacheia o JWT
 * localmente, valida a assinatura sem depender de rede, e aplica grace
 * period quando o token expirou mas o app não conseguiu revalidar online.
 *
 * Uso típico no boot do app:
 *   const result = await licenseManager.validateCached();
 *   if (result.status === 'expired' || result.status === 'invalid_signature') {
 *     // bloquear ou forçar novo login
 *   }
 *   if (result.status === 'grace_period') {
 *     // mostrar aviso discreto, mas deixar usar
 *   }
 */
export class LicenseManager {
  private publicKey: KeyLike | null = null;

  constructor(private readonly config: LicenseManagerConfig) {}

  private async getPublicKey(): Promise<KeyLike> {
    if (!this.publicKey) {
      this.publicKey = await importSPKI(this.config.publicKeyPem, 'RS256');
    }
    return this.publicKey;
  }

  /** Verifica um JWT específico (assinatura + expiração), sem tocar em rede. */
  async verify(token: string): Promise<LicenseValidationResult> {
    let payload: LicensePayload;
    try {
      const publicKey = await this.getPublicKey();
      const { payload: raw } = await jwtVerify(token, publicKey, { algorithms: ['RS256'] });
      payload = this.mapPayload(raw);
    } catch (err) {
      // jose valida a assinatura primeiro e só depois a expiração — um JWT
      // expirado mas assinado corretamente chega aqui como JWTExpired,
      // ainda carregando o payload já verificado (err.payload). Só um erro
      // de assinatura de fato (ou token malformado) deve virar invalid_signature.
      const claims = this.extractPayloadFromExpiredError(err);
      if (!claims) return { status: 'invalid_signature', payload: null };
      payload = claims;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds <= payload.expiresAt) {
      return { status: 'valid', payload };
    }

    const graceDays = this.config.gracePeriodDays ?? DEFAULT_GRACE_PERIOD_DAYS;
    const graceDeadline = payload.expiresAt + graceDays * 86400;

    if (nowSeconds <= graceDeadline) {
      const graceDaysRemaining = Math.ceil((graceDeadline - nowSeconds) / 86400);
      return { status: 'grace_period', payload, graceDaysRemaining };
    }

    return { status: 'expired', payload };
  }

  private mapPayload(raw: Record<string, unknown>): LicensePayload {
    return {
      tenantId: raw.tenantId as string,
      deviceId: raw.deviceId as string,
      planKey: raw.planKey as string,
      features: (raw.features as Record<string, unknown>) ?? {},
      issuedAt: raw.iat as number,
      expiresAt: raw.exp as number,
    };
  }

  private extractPayloadFromExpiredError(err: unknown): LicensePayload | null {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: string }).code === 'ERR_JWT_EXPIRED' &&
      'payload' in err
    ) {
      return this.mapPayload((err as { payload: Record<string, unknown> }).payload);
    }
    return null;
  }

  /** Lê o token cacheado localmente e valida sem rede. Uso: boot do app. */
  async validateCached(): Promise<LicenseValidationResult> {
    const cached = await this.config.tokenStore.getItem(TOKEN_STORE_KEYS.LICENSE_TOKEN);
    if (!cached) return { status: 'missing', payload: null };
    return this.verify(cached);
  }

  /**
   * Tenta renovar a licença via rede. Em caso de falha (offline), não
   * lança — retorna o resultado da validação do token cacheado (que pode
   * cair em grace_period). Chamar isto periodicamente, não só no boot.
   */
  async refresh(): Promise<LicenseValidationResult> {
    try {
      const freshToken = await this.config.fetchFreshLicense();
      await this.config.tokenStore.setItem(TOKEN_STORE_KEYS.LICENSE_TOKEN, freshToken);
      return this.verify(freshToken);
    } catch {
      // Sem rede ou servidor indisponível — cai no que já está em cache.
      return this.validateCached();
    }
  }

  async clear(): Promise<void> {
    await this.config.tokenStore.removeItem(TOKEN_STORE_KEYS.LICENSE_TOKEN);
    this.publicKey = null;
  }
}
