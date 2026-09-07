/**
 * Abstração de armazenamento seguro de tokens, implementada por plataforma:
 * - Electron (Desktop):  safeStorage
 * - React Native (Mobile): expo-secure-store
 * - Tizen (TV):           Web Crypto (AES-GCM) + localStorage/IndexedDB
 *
 * O AuthClient nunca sabe qual implementação está usando — cada app injeta
 * a sua no momento da inicialização.
 */
export interface ISecureTokenStore {
  /** Recupera um valor armazenado, ou null se não existir. */
  getItem(key: string): Promise<string | null>;

  /** Persiste um valor de forma criptografada/segura na plataforma. */
  setItem(key: string, value: string): Promise<void>;

  /** Remove um valor armazenado. */
  removeItem(key: string): Promise<void>;

  /** Limpa todos os valores geridos por este store (usado no sign-out completo). */
  clear(): Promise<void>;
}

export const TOKEN_STORE_KEYS = {
  ACCESS_TOKEN: 'orun.identity.access_token',
  REFRESH_TOKEN: 'orun.identity.refresh_token',
  LICENSE_TOKEN: 'orun.identity.license_token',
  DEVICE_ID: 'orun.identity.device_id',
} as const;
