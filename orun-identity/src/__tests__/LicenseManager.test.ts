// @vitest-environment node
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { SignJWT, exportSPKI, generateKeyPair, importPKCS8, exportPKCS8 } from 'jose';
import { LicenseManager } from '../core/LicenseManager';
import type { ISecureTokenStore } from '../storage/ISecureTokenStore';
import { TOKEN_STORE_KEYS } from '../storage/ISecureTokenStore';

function createMemoryTokenStore(): ISecureTokenStore {
  const map = new Map<string, string>();
  return {
    async getItem(key) {
      return map.get(key) ?? null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
    async removeItem(key) {
      map.delete(key);
    },
    async clear() {
      map.clear();
    },
  };
}

let publicKeyPem: string;
let privateKeyPem: string;
let wrongPublicKeyPem: string;

async function signLicense(overrides: {
  expiresInSeconds?: number;
  issuedAtOffsetSeconds?: number;
} = {}): Promise<string> {
  const privateKey = await importPKCS8(privateKeyPem, 'RS256');
  const nowSeconds = Math.floor(Date.now() / 1000) + (overrides.issuedAtOffsetSeconds ?? 0);
  const exp = nowSeconds + (overrides.expiresInSeconds ?? 7 * 86400);

  return new SignJWT({
    tenantId: 'tenant-1',
    deviceId: 'device-1',
    planKey: 'desktop_pro',
    features: { ai_agents_max: 15 },
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt(nowSeconds)
    .setExpirationTime(exp)
    .sign(privateKey);
}

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  publicKeyPem = await exportSPKI(publicKey);
  privateKeyPem = await exportPKCS8(privateKey);

  const wrongPair = await generateKeyPair('RS256');
  wrongPublicKeyPem = await exportSPKI(wrongPair.publicKey);
});

describe('LicenseManager', () => {
  it('retorna status "missing" quando não há token cacheado', async () => {
    const manager = new LicenseManager({
      tokenStore: createMemoryTokenStore(),
      publicKeyPem,
      fetchFreshLicense: vi.fn(),
    });

    const result = await manager.validateCached();
    expect(result.status).toBe('missing');
  });

  it('valida um token assinado corretamente e ainda dentro do prazo', async () => {
    const token = await signLicense({ expiresInSeconds: 7 * 86400 });
    const tokenStore = createMemoryTokenStore();
    await tokenStore.setItem(TOKEN_STORE_KEYS.LICENSE_TOKEN, token);

    const manager = new LicenseManager({ tokenStore, publicKeyPem, fetchFreshLicense: vi.fn() });
    const result = await manager.validateCached();

    expect(result.status).toBe('valid');
    expect(result.payload?.tenantId).toBe('tenant-1');
    expect(result.payload?.planKey).toBe('desktop_pro');
    expect(result.payload?.features.ai_agents_max).toBe(15);
  });

  it('detecta assinatura inválida quando verificado com a chave pública errada', async () => {
    const token = await signLicense();
    const tokenStore = createMemoryTokenStore();
    await tokenStore.setItem(TOKEN_STORE_KEYS.LICENSE_TOKEN, token);

    const manager = new LicenseManager({
      tokenStore,
      publicKeyPem: wrongPublicKeyPem,
      fetchFreshLicense: vi.fn(),
    });
    const result = await manager.validateCached();

    expect(result.status).toBe('invalid_signature');
    expect(result.payload).toBeNull();
  });

  it('cai em grace_period quando expirado mas dentro da janela de tolerância', async () => {
    // Expirou há 1 dia; grace period default é 3 dias.
    const token = await signLicense({ expiresInSeconds: -1 * 86400 });
    const tokenStore = createMemoryTokenStore();
    await tokenStore.setItem(TOKEN_STORE_KEYS.LICENSE_TOKEN, token);

    const manager = new LicenseManager({ tokenStore, publicKeyPem, fetchFreshLicense: vi.fn() });
    const result = await manager.validateCached();

    expect(result.status).toBe('grace_period');
    expect(result.graceDaysRemaining).toBeGreaterThanOrEqual(1);
    expect(result.graceDaysRemaining).toBeLessThanOrEqual(2);
  });

  it('retorna expired quando passou do grace period', async () => {
    // Expirou há 10 dias; grace period default é 3 dias.
    const token = await signLicense({ expiresInSeconds: -10 * 86400 });
    const tokenStore = createMemoryTokenStore();
    await tokenStore.setItem(TOKEN_STORE_KEYS.LICENSE_TOKEN, token);

    const manager = new LicenseManager({ tokenStore, publicKeyPem, fetchFreshLicense: vi.fn() });
    const result = await manager.validateCached();

    expect(result.status).toBe('expired');
  });

  it('respeita gracePeriodDays customizado', async () => {
    const token = await signLicense({ expiresInSeconds: -5 * 86400 });
    const tokenStore = createMemoryTokenStore();
    await tokenStore.setItem(TOKEN_STORE_KEYS.LICENSE_TOKEN, token);

    const manager = new LicenseManager({
      tokenStore,
      publicKeyPem,
      gracePeriodDays: 7,
      fetchFreshLicense: vi.fn(),
    });
    const result = await manager.validateCached();

    expect(result.status).toBe('grace_period');
  });

  describe('refresh()', () => {
    it('busca licença nova via fetchFreshLicense e persiste no token store', async () => {
      const freshToken = await signLicense({ expiresInSeconds: 7 * 86400 });
      const tokenStore = createMemoryTokenStore();
      const fetchFreshLicense = vi.fn(async () => freshToken);

      const manager = new LicenseManager({ tokenStore, publicKeyPem, fetchFreshLicense });
      const result = await manager.refresh();

      expect(result.status).toBe('valid');
      expect(await tokenStore.getItem(TOKEN_STORE_KEYS.LICENSE_TOKEN)).toBe(freshToken);
    });

    it('cai para validação do cache quando fetchFreshLicense falha (offline)', async () => {
      const cachedToken = await signLicense({ expiresInSeconds: 7 * 86400 });
      const tokenStore = createMemoryTokenStore();
      await tokenStore.setItem(TOKEN_STORE_KEYS.LICENSE_TOKEN, cachedToken);

      const fetchFreshLicense = vi.fn(async () => {
        throw new Error('network unreachable');
      });

      const manager = new LicenseManager({ tokenStore, publicKeyPem, fetchFreshLicense });
      const result = await manager.refresh();

      expect(result.status).toBe('valid');
      expect(fetchFreshLicense).toHaveBeenCalled();
    });
  });

  it('clear() remove o token cacheado', async () => {
    const token = await signLicense();
    const tokenStore = createMemoryTokenStore();
    await tokenStore.setItem(TOKEN_STORE_KEYS.LICENSE_TOKEN, token);

    const manager = new LicenseManager({ tokenStore, publicKeyPem, fetchFreshLicense: vi.fn() });
    await manager.clear();

    const result = await manager.validateCached();
    expect(result.status).toBe('missing');
  });
});
