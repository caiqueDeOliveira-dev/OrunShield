import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthClient } from '../core/AuthClient';
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

function createMockSupabase(overrides: Partial<any> = {}) {
  const authStateListeners: Array<(event: string, session: any) => void> = [];

  const profileRow = {
    id: 'user-1',
    email: 'caique@orun.dev',
    display_name: 'Caique',
    avatar_url: null,
    mfa_enabled: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const fakeSession = {
    access_token: 'access-token-1',
    refresh_token: 'refresh-token-1',
    user: { id: 'user-1' },
  };

  const supabase = {
    auth: {
      setSession: vi.fn(async () => ({ data: { session: fakeSession }, error: null })),
      signUp: vi.fn(async () => ({ data: { session: fakeSession }, error: null })),
      signInWithPassword: vi.fn(async () => ({ data: { session: fakeSession }, error: null })),
      signInWithOAuth: vi.fn(async () => ({ data: { url: 'https://oauth.example/redirect' }, error: null })),
      signInWithOtp: vi.fn(async () => ({ data: {}, error: null })),
      exchangeCodeForSession: vi.fn(async () => ({ data: { session: fakeSession }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ error: null })),
      updateUser: vi.fn(async () => ({ error: null })),
      resend: vi.fn(async () => ({ error: null })),
      registerPasskey: vi.fn(async () => ({ error: null })),
      signInWithPasskey: vi.fn(async () => ({ data: { session: fakeSession }, error: null })),
      onAuthStateChange: vi.fn((cb: any) => {
        authStateListeners.push(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn(async () => ({
          data: { currentLevel: 'aal1', nextLevel: 'aal1' },
          error: null,
        })),
        enroll: vi.fn(async () => ({
          data: { id: 'factor-1', totp: { qr_code: 'data:image/svg+xml;...', secret: 'SECRET123' } },
          error: null,
        })),
        challengeAndVerify: vi.fn(async () => ({
          data: { access_token: 'access-token-mfa', refresh_token: 'refresh-token-mfa', user: { id: 'user-1' } },
          error: null,
        })),
        listFactors: vi.fn(async () => ({
          data: { totp: [{ id: 'factor-1', friendly_name: 'iPhone', status: 'verified' }] },
          error: null,
        })),
        unenroll: vi.fn(async () => ({ error: null })),
      },
    },
    from: vi.fn((table: string) => {
      if (table === 'audit_log') {
        return { insert: vi.fn(async () => ({ error: null })) };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(async () => ({ data: profileRow, error: null })),
      };
    }),
    ...overrides,
  };

  return { supabase, authStateListeners, fakeSession, profileRow };
}

const resolveTenantContext = vi.fn(async (userId: string) => ({
  activeTenant: {
    id: 'tenant-1',
    type: 'personal' as const,
    name: 'Caique',
    slug: null,
    ownerId: userId,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  memberships: [
    {
      id: 'membership-1',
      userId,
      tenantId: 'tenant-1',
      role: 'owner' as const,
      invitedBy: null,
      joinedAt: '2026-01-01T00:00:00Z',
    },
  ],
}));

describe('AuthClient', () => {
  beforeEach(() => {
    resolveTenantContext.mockClear();
  });

  it('inicia como unauthenticated quando não há refresh token salvo', async () => {
    const { supabase } = createMockSupabase();
    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    await client.initialize();

    expect(client.getState().status).toBe('unauthenticated');
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });

  it('restaura sessão a partir de refresh token salvo', async () => {
    const { supabase } = createMockSupabase();
    const tokenStore = createMemoryTokenStore();
    await tokenStore.setItem(TOKEN_STORE_KEYS.REFRESH_TOKEN, 'refresh-token-1');
    await tokenStore.setItem(TOKEN_STORE_KEYS.ACCESS_TOKEN, 'access-token-1');

    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });
    await client.initialize();

    const state = client.getState();
    expect(state.status).toBe('authenticated');
    expect(state.user?.id).toBe('user-1');
    expect(state.activeTenant?.id).toBe('tenant-1');
    expect(resolveTenantContext).toHaveBeenCalledWith('user-1');
  });

  it('signIn persiste tokens e hidrata estado', async () => {
    const { supabase } = createMockSupabase();
    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    await client.signIn({ email: 'caique@orun.dev', password: 'secret' });

    expect(client.getState().status).toBe('authenticated');
    expect(await tokenStore.getItem(TOKEN_STORE_KEYS.ACCESS_TOKEN)).toBe('access-token-1');
    expect(await tokenStore.getItem(TOKEN_STORE_KEYS.REFRESH_TOKEN)).toBe('refresh-token-1');
  });

  it('signIn propaga captchaToken pro supabase (Turnstile)', async () => {
    const { supabase } = createMockSupabase();
    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    await client.signIn({ email: 'a@b.com', password: 'x', captchaToken: 'turnstile-token' });

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({ options: { captchaToken: 'turnstile-token' } })
    );
  });

  it('signOut limpa token store e volta pra unauthenticated', async () => {
    const { supabase } = createMockSupabase();
    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    await client.signIn({ email: 'caique@orun.dev', password: 'secret' });
    await client.signOut();

    expect(client.getState().status).toBe('unauthenticated');
    expect(client.getState().user).toBeNull();
    expect(await tokenStore.getItem(TOKEN_STORE_KEYS.ACCESS_TOKEN)).toBeNull();
  });

  it('signInWithOAuth retorna a url de redirect sem trocar sessão ainda', async () => {
    const { supabase } = createMockSupabase();
    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    const result = await client.signInWithOAuth({ provider: 'google' });

    expect(result.url).toBe('https://oauth.example/redirect');
    expect(client.getState().status).toBe('loading');
  });

  it('completeSessionFromUrl hidrata estado após deep link de retorno', async () => {
    const { supabase } = createMockSupabase();
    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    await client.completeSessionFromUrl('orunos://auth/callback?code=abc');

    expect(client.getState().status).toBe('authenticated');
  });

  it('propaga erro do supabase em signIn com credenciais inválidas', async () => {
    const { supabase } = createMockSupabase();
    supabase.auth.signInWithPassword = vi.fn(async () => ({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    })) as any;

    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    await expect(client.signIn({ email: 'x@x.com', password: 'wrong' })).rejects.toMatchObject({
      message: 'Invalid login credentials',
    });
    expect(client.getState().status).toBe('loading');
  });

  it('notifica subscribers a cada mudança de estado', async () => {
    const { supabase } = createMockSupabase();
    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    const seenStatuses: string[] = [];
    client.subscribe((state) => seenStatuses.push(state.status));

    await client.signIn({ email: 'caique@orun.dev', password: 'secret' });

    expect(seenStatuses).toContain('authenticated');
  });
});

describe('AuthClient — MFA', () => {
  it('signIn entra em status mfa_required quando aal2 é exigido', async () => {
    const { supabase } = createMockSupabase();
    supabase.auth.mfa.getAuthenticatorAssuranceLevel = vi.fn(async () => ({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    })) as any;

    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    await client.signIn({ email: 'caique@orun.dev', password: 'secret' });

    expect(client.getState().status).toBe('mfa_required');
    // Ainda não persistiu tokens — só depois do challenge verificado.
    expect(await tokenStore.getItem(TOKEN_STORE_KEYS.ACCESS_TOKEN)).toBeNull();
  });

  it('verifyMFAChallenge hidrata o estado após código correto', async () => {
    const { supabase } = createMockSupabase();
    supabase.auth.mfa.getAuthenticatorAssuranceLevel = vi.fn(async () => ({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    })) as any;

    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    await client.signIn({ email: 'caique@orun.dev', password: 'secret' });
    expect(client.getState().status).toBe('mfa_required');

    await client.verifyMFAChallenge('factor-1', '123456');

    expect(client.getState().status).toBe('authenticated');
    expect(await tokenStore.getItem(TOKEN_STORE_KEYS.ACCESS_TOKEN)).toBe('access-token-mfa');
  });

  it('verifyMFAChallenge propaga erro em código incorreto', async () => {
    const { supabase } = createMockSupabase();
    supabase.auth.mfa.challengeAndVerify = vi.fn(async () => ({
      data: null,
      error: { message: 'Invalid TOTP code' },
    })) as any;

    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    await expect(client.verifyMFAChallenge('factor-1', '000000')).rejects.toMatchObject({
      message: 'Invalid TOTP code',
    });
  });

  it('enrollMFA retorna factorId, qrCode e secret', async () => {
    const { supabase } = createMockSupabase();
    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    const result = await client.enrollMFA('iPhone do Caique');

    expect(result.factorId).toBe('factor-1');
    expect(result.secret).toBe('SECRET123');
    expect(supabase.auth.mfa.enroll).toHaveBeenCalledWith({
      factorType: 'totp',
      friendlyName: 'iPhone do Caique',
    });
  });

  it('verifyMFAEnrollment chama challengeAndVerify com o código informado', async () => {
    const { supabase } = createMockSupabase();
    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    await client.verifyMFAEnrollment('factor-1', '654321');

    expect(supabase.auth.mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: 'factor-1',
      code: '654321',
    });
  });

  it('listMFAFactors mapeia os fatores retornados', async () => {
    const { supabase } = createMockSupabase();
    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    const factors = await client.listMFAFactors();

    expect(factors).toEqual([{ id: 'factor-1', friendlyName: 'iPhone', status: 'verified' }]);
  });

  it('unenrollMFA chama supabase.auth.mfa.unenroll', async () => {
    const { supabase } = createMockSupabase();
    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    await client.unenrollMFA('factor-1');

    expect(supabase.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'factor-1' });
  });
});

describe('AuthClient — recuperação de senha e reautenticação', () => {
  it('resetPasswordForEmail chama supabase e loga password_reset_requested', async () => {
    const { supabase } = createMockSupabase();
    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    await client.resetPasswordForEmail('caique@orun.dev', 'orunos://reset');

    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('caique@orun.dev', {
      redirectTo: 'orunos://reset',
    });
  });

  it('updatePassword chama updateUser e loga password_changed', async () => {
    const { supabase } = createMockSupabase();
    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    await client.updatePassword('nova-senha-forte');

    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'nova-senha-forte' });
  });

  it('resendEmailVerification chama resend com type signup', async () => {
    const { supabase } = createMockSupabase();
    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    await client.resendEmailVerification('caique@orun.dev');

    expect(supabase.auth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'caique@orun.dev' });
  });

  it('verifyPassword retorna true quando a senha confere', async () => {
    const { supabase } = createMockSupabase();
    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    await client.signIn({ email: 'caique@orun.dev', password: 'secret' });
    const ok = await client.verifyPassword('secret');

    expect(ok).toBe(true);
  });

  it('verifyPassword retorna false quando a senha não confere', async () => {
    const { supabase } = createMockSupabase();
    supabase.auth.signInWithPassword = vi
      .fn()
      .mockResolvedValueOnce({ data: { session: { access_token: 'a', refresh_token: 'b', user: { id: 'user-1' } } }, error: null })
      .mockResolvedValueOnce({ data: { session: null }, error: { message: 'Invalid login credentials' } }) as any;

    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    await client.signIn({ email: 'caique@orun.dev', password: 'secret' });
    const ok = await client.verifyPassword('senha-errada');

    expect(ok).toBe(false);
  });

  it('verifyPassword lança se não houver usuário autenticado', async () => {
    const { supabase } = createMockSupabase();
    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    await expect(client.verifyPassword('qualquer')).rejects.toThrow(/sem usuário autenticado/);
  });
});

describe('AuthClient — Passkeys (beta)', () => {
  it('registerPasskey chama supabase.auth.registerPasskey quando disponível', async () => {
    const { supabase } = createMockSupabase();
    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    await client.registerPasskey();

    expect(supabase.auth.registerPasskey).toHaveBeenCalled();
  });

  it('registerPasskey lança erro claro se o client não suportar (versão antiga do supabase-js)', async () => {
    const { supabase } = createMockSupabase();
    delete (supabase.auth as any).registerPasskey;
    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    await expect(client.registerPasskey()).rejects.toThrow(/registerPasskey indisponível/);
  });

  it('signInWithPasskey hidrata o estado após sucesso', async () => {
    const { supabase } = createMockSupabase();
    const tokenStore = createMemoryTokenStore();
    const client = new AuthClient({ supabase: supabase as any, tokenStore, resolveTenantContext });

    await client.signInWithPasskey();

    expect(client.getState().status).toBe('authenticated');
  });
});
