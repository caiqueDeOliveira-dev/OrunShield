import { describe, it, expect, vi } from 'vitest';
import { ElectronSecureTokenStore } from '../storage/electron';
import { ExpoSecureTokenStore } from '../storage/expo';
import { WebCryptoSecureTokenStore } from '../storage/webcrypto';
import { webcrypto } from 'node:crypto';

// Node 18+ expõe webcrypto; garantimos que o global crypto exista no ambiente de teste.
if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = webcrypto;
}

describe('ElectronSecureTokenStore', () => {
  it('lança erro se encryption não estiver disponível na plataforma', () => {
    const fakeSafeStorage = {
      isEncryptionAvailable: () => false,
      encryptString: vi.fn(),
      decryptString: vi.fn(),
    };
    const fakeBackend = { read: vi.fn(), write: vi.fn(), delete: vi.fn(), clearAll: vi.fn() };

    expect(() => new ElectronSecureTokenStore(fakeSafeStorage as any, fakeBackend as any)).toThrow(
      /encryption indisponível/
    );
  });

  it('criptografa no set e descriptografa no get, delegando ao backend', async () => {
    const store = new Map<string, Buffer>();
    const fakeSafeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (plain: string) => Buffer.from(`enc(${plain})`),
      decryptString: (buf: Buffer) => buf.toString().replace(/^enc\(/, '').replace(/\)$/, ''),
    };
    const fakeBackend = {
      read: vi.fn(async (key: string) => store.get(key) ?? null),
      write: vi.fn(async (key: string, value: Buffer) => {
        store.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        store.delete(key);
      }),
      clearAll: vi.fn(async () => store.clear()),
    };

    const tokenStore = new ElectronSecureTokenStore(fakeSafeStorage as any, fakeBackend as any);

    await tokenStore.setItem('access_token', 'abc123');
    expect(await tokenStore.getItem('access_token')).toBe('abc123');

    await tokenStore.removeItem('access_token');
    expect(await tokenStore.getItem('access_token')).toBeNull();
  });
});

describe('ExpoSecureTokenStore', () => {
  it('delega chamadas para o módulo expo-secure-store injetado', async () => {
    const backing = new Map<string, string>();
    const fakeSecureStore = {
      getItemAsync: vi.fn(async (key: string) => backing.get(key) ?? null),
      setItemAsync: vi.fn(async (key: string, value: string) => {
        backing.set(key, value);
      }),
      deleteItemAsync: vi.fn(async (key: string) => {
        backing.delete(key);
      }),
    };

    const store = new ExpoSecureTokenStore(fakeSecureStore);
    await store.setItem('refresh_token', 'xyz');

    expect(await store.getItem('refresh_token')).toBe('xyz');
    expect(fakeSecureStore.setItemAsync).toHaveBeenCalledWith('refresh_token', 'xyz');
  });

  it('clear() remove apenas as chaves que este store gerenciou', async () => {
    const backing = new Map<string, string>();
    const fakeSecureStore = {
      getItemAsync: vi.fn(async (key: string) => backing.get(key) ?? null),
      setItemAsync: vi.fn(async (key: string, value: string) => {
        backing.set(key, value);
      }),
      deleteItemAsync: vi.fn(async (key: string) => {
        backing.delete(key);
      }),
    };

    const store = new ExpoSecureTokenStore(fakeSecureStore);
    await store.setItem('a', '1');
    await store.setItem('b', '2');
    await store.clear();

    expect(fakeSecureStore.deleteItemAsync).toHaveBeenCalledTimes(2);
  });
});

describe('WebCryptoSecureTokenStore', () => {
  it('lança erro se getItem/setItem forem chamados antes de initialize()', async () => {
    const fakeBackend = { read: vi.fn(), write: vi.fn(), delete: vi.fn(), clearAll: vi.fn() };
    const store = new WebCryptoSecureTokenStore(fakeBackend as any);

    await expect(store.setItem('k', 'v')).rejects.toThrow(/não inicializado/);
  });

  it('round-trip: criptografa no set e recupera o valor original no get', async () => {
    const backing = new Map<string, Uint8Array>();
    const fakeBackend = {
      read: vi.fn(async (key: string) => backing.get(key) ?? null),
      write: vi.fn(async (key: string, value: Uint8Array) => {
        backing.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        backing.delete(key);
      }),
      clearAll: vi.fn(async () => backing.clear()),
    };

    const store = new WebCryptoSecureTokenStore(fakeBackend as any);
    const keyMaterial = webcrypto.getRandomValues(new Uint8Array(32));
    await store.initialize(keyMaterial);

    await store.setItem('license_token', 'super-secret-jwt');
    const value = await store.getItem('license_token');

    expect(value).toBe('super-secret-jwt');
    // Confirma que o que foi persistido não é o texto plano.
    const raw = backing.get('license_token')!;
    expect(Buffer.from(raw).includes('super-secret-jwt')).toBe(false);
  });

  it('getItem retorna null para chave inexistente', async () => {
    const fakeBackend = {
      read: vi.fn(async () => null),
      write: vi.fn(),
      delete: vi.fn(),
      clearAll: vi.fn(),
    };
    const store = new WebCryptoSecureTokenStore(fakeBackend as any);
    await store.initialize(webcrypto.getRandomValues(new Uint8Array(32)));

    expect(await store.getItem('nope')).toBeNull();
  });
});
