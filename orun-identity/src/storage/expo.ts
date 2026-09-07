import type { ISecureTokenStore } from './ISecureTokenStore';

/**
 * Implementação para Expo/React Native (Mobile), usando expo-secure-store.
 *
 * Não importamos expo-secure-store diretamente aqui para manter o pacote
 * livre de dependências nativas — o app mobile injeta as funções do módulo
 * no momento da inicialização.
 */
export interface ExpoSecureStoreModule {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export class ExpoSecureTokenStore implements ISecureTokenStore {
  private readonly managedKeys = new Set<string>();

  constructor(private readonly secureStore: ExpoSecureStoreModule) {}

  async getItem(key: string): Promise<string | null> {
    return this.secureStore.getItemAsync(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    this.managedKeys.add(key);
    await this.secureStore.setItemAsync(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.managedKeys.delete(key);
    await this.secureStore.deleteItemAsync(key);
  }

  async clear(): Promise<void> {
    await Promise.all(
      Array.from(this.managedKeys).map((key) => this.secureStore.deleteItemAsync(key))
    );
    this.managedKeys.clear();
  }
}
