import type { ISecureTokenStore } from './ISecureTokenStore';

/**
 * Implementação para Electron (Desktop), reaproveitando o padrão safeStorage
 * já usado no resto do app (ex: secretStore de social-media.cjs).
 *
 * O caller deve passar a instância de `safeStorage` do módulo `electron` e um
 * caminho de arquivo (ou outro backend de persistência, ex: better-sqlite3)
 * onde os bytes criptografados serão gravados — safeStorage só criptografa/
 * descriptografa em memória, não persiste sozinho.
 */
export interface ElectronSafeStorage {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface KeyValueBackend {
  read(key: string): Promise<Buffer | null>;
  write(key: string, value: Buffer): Promise<void>;
  delete(key: string): Promise<void>;
  clearAll(): Promise<void>;
}

export class ElectronSecureTokenStore implements ISecureTokenStore {
  constructor(
    private readonly safeStorage: ElectronSafeStorage,
    private readonly backend: KeyValueBackend
  ) {
    if (!this.safeStorage.isEncryptionAvailable()) {
      // Fail fast — não silenciar. Melhor o app avisar o usuário do que
      // gravar tokens sem criptografia real.
      throw new Error(
        '[@orun/identity] safeStorage encryption indisponível nesta plataforma/SO.'
      );
    }
  }

  async getItem(key: string): Promise<string | null> {
    const encrypted = await this.backend.read(key);
    if (!encrypted) return null;
    return this.safeStorage.decryptString(encrypted);
  }

  async setItem(key: string, value: string): Promise<void> {
    const encrypted = this.safeStorage.encryptString(value);
    await this.backend.write(key, encrypted);
  }

  async removeItem(key: string): Promise<void> {
    await this.backend.delete(key);
  }

  async clear(): Promise<void> {
    await this.backend.clearAll();
  }
}
