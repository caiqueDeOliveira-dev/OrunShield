import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth, useAuthBridge, type AuthBridge } from '../hooks/useAuth';
import type { AuthClient } from '../core/AuthClient';
import type { AuthState } from '../types';

function createFakeAuthClient(): AuthClient {
  let state: AuthState = {
    status: 'unauthenticated',
    user: null,
    activeTenant: null,
    memberships: [],
    accessToken: null,
  };
  const listeners = new Set<(s: AuthState) => void>();

  return {
    getState: () => state,
    subscribe: (listener: (s: AuthState) => void) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    signIn: vi.fn(async () => {
      state = { ...state, status: 'authenticated' };
      listeners.forEach((l) => l(state));
    }),
    signUp: vi.fn(),
    signInWithOAuth: vi.fn(),
    signInWithMagicLink: vi.fn(),
    completeSessionFromUrl: vi.fn(),
    signOut: vi.fn(async () => {
      state = { ...state, status: 'unauthenticated' };
      listeners.forEach((l) => l(state));
    }),
  } as unknown as AuthClient;
}

describe('useAuth', () => {
  it('reflete o estado inicial do AuthClient e reage a mudanças', async () => {
    const client = createFakeAuthClient();
    const { result } = renderHook(() => useAuth(client));

    expect(result.current.state.status).toBe('unauthenticated');

    await act(async () => {
      await result.current.signIn({ email: 'a@b.com', password: 'x' });
    });

    await waitFor(() => expect(result.current.state.status).toBe('authenticated'));
  });

  it('desinscreve do client ao desmontar', () => {
    const client = createFakeAuthClient();
    const unsubscribeSpy = vi.fn();
    (client.subscribe as any) = vi.fn((listener: any) => {
      listener(client.getState());
      return unsubscribeSpy;
    });

    const { unmount } = renderHook(() => useAuth(client));
    unmount();

    expect(unsubscribeSpy).toHaveBeenCalled();
  });
});

describe('useAuthBridge', () => {
  function createFakeBridge(): AuthBridge {
    let cb: ((s: AuthState) => void) | null = null;
    return {
      getState: vi.fn(async () => ({
        status: 'unauthenticated' as const,
        user: null,
        activeTenant: null,
        memberships: [],
        accessToken: null,
      })),
      onStateChanged: vi.fn((listener) => {
        cb = listener;
        return () => {
          cb = null;
        };
      }),
      signIn: vi.fn(async () => {
        cb?.({
          status: 'authenticated' as const,
          user: null,
          activeTenant: null,
          memberships: [],
          accessToken: 'tok',
        });
      }),
      signUp: vi.fn(),
      signOut: vi.fn(),
    };
  }

  it('busca estado inicial via getState() e escuta onStateChanged (padrão IPC do Desktop)', async () => {
    const bridge = createFakeBridge();
    const { result } = renderHook(() => useAuthBridge(bridge));

    await waitFor(() => expect(bridge.getState).toHaveBeenCalled());

    await act(async () => {
      await result.current.signIn({ email: 'a@b.com', password: 'x' });
    });

    await waitFor(() => expect(result.current.state.status).toBe('authenticated'));
  });
});
