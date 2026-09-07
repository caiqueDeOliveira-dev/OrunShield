import type { ISecureTokenStore } from './ISecureTokenStore';

/**
 * Implementação para Tizen (OrunTV), usando Web Crypto (AES-GCM) já que a
 * plataforma não expõe um keychain nativo como Electron/Expo.
 *
 * A chave de criptografia é derivada uma vez e mantida em memória; os bytes
 * cifrados são persistidos em IndexedDB (via `backend`) para sobreviver a
 * reinícios do app.
 */
export interface KeyValueBackend {
  read(key: string): Promise<Uint8Array | null>;
  write(key: string, value: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
  clearAll(): Promise<void>;
}

const IV_LENGTH_BYTES = 12;

export class WebCryptoSecureTokenStore implements ISecureTokenStore {
  private cryptoKey: CryptoKey | null = null;

  constructor(
    private readonly backend: KeyValueBackend,
    private readonly subtle: SubtleCrypto = crypto.subtle
  ) {}

  /**
   * Deve ser chamado uma vez na inicialização do app, com uma chave derivada
   * de um segredo estável do dispositivo (ex: ID de hardware do Tizen, nunca
   * hardcoded). Sem isso, getItem/setItem lançam erro.
   */
  async initialize(rawKeyMaterial: Uint8Array): Promise<void> {
    this.cryptoKey = await this.subtle.importKey(
      'raw',
      rawKeyMaterial as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  }

  private requireKey(): CryptoKey {
    if (!this.cryptoKey) {
      throw new Error(
        '[@orun/identity] WebCryptoSecureTokenStore não inicializado — chame initialize() primeiro.'
      );
    }
    return this.cryptoKey;
  }

  async getItem(key: string): Promise<string | null> {
    const stored = await this.backend.read(key);
    if (!stored) return null;

    const iv = stored.slice(0, IV_LENGTH_BYTES);
    const ciphertext = stored.slice(IV_LENGTH_BYTES);

    const plainBuffer = await this.subtle.decrypt(
      { name: 'AES-GCM', iv },
      this.requireKey(),
      ciphertext
    );
    return new TextDecoder().decode(plainBuffer);
  }

  async setItem(key: string, value: string): Promise<void> {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
    const encoded = new TextEncoder().encode(value);

    const ciphertext = await this.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.requireKey(),
      encoded
    );

    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    await this.backend.write(key, combined);
  }

  async removeItem(key: string): Promise<void> {
    await this.backend.delete(key);
  }

  async clear(): Promise<void> {
    await this.backend.clearAll();
  }
}
