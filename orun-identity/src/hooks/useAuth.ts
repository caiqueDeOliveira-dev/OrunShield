import { useEffect, useState } from 'react';
import type { AuthClient } from '../core/AuthClient';
import type { AuthState } from '../types';

/**
 * Hook compartilhado entre Mobile (Expo/React Native) e qualquer superfície
 * web (ex: futura Orun Casa Kiosk) que rode o AuthClient no próprio processo
 * — diferente do Desktop, onde o AuthClient vive no main process e o
 * renderer consome via IPC (ver useAuthBridge nos exemplos do README).
 *
 * Uso:
 *   const authClient = useMemo(() => new AuthClient({ ... }), []);
 *   const { state, signIn, signOut } = useAuth(authClient);
 */
export function useAuth(client: AuthClient) {
  const [state, setState] = useState<AuthState>(client.getState());

  useEffect(() => {
    const unsubscribe = client.subscribe(setState);
    return unsubscribe;
  }, [client]);

  return {
    state,
    signIn: client.signIn.bind(client),
    signUp: client.signUp.bind(client),
    signInWithOAuth: client.signInWithOAuth.bind(client),
    signInWithMagicLink: client.signInWithMagicLink.bind(client),
    completeSessionFromUrl: client.completeSessionFromUrl.bind(client),
    signOut: client.signOut.bind(client),
  };
}

/**
 * Variante para o Desktop: em vez de um AuthClient local, recebe funções que
 * fazem a ponte IPC com o main process (onde o AuthClient real roda).
 * O shape retornado é idêntico ao de useAuth() para os componentes de UI
 * poderem ser compartilhados entre Desktop e Mobile sem reescrever telas.
 */
export interface AuthBridge {
  getState(): Promise<AuthState>;
  onStateChanged(cb: (state: AuthState) => void): () => void;
  signIn(params: { email: string; password: string; captchaToken?: string }): Promise<void>;
  signUp(params: { email: string; password: string; displayName?: string; captchaToken?: string }): Promise<void>;
  signOut(): Promise<void>;
}

export function useAuthBridge(bridge: AuthBridge) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
    activeTenant: null,
    memberships: [],
    accessToken: null,
  });

  useEffect(() => {
    let mounted = true;
    bridge.getState().then((s) => {
      if (mounted) setState(s);
    });
    const unsubscribe = bridge.onStateChanged(setState);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [bridge]);

  return {
    state,
    signIn: bridge.signIn,
    signUp: bridge.signUp,
    signOut: bridge.signOut,
  };
}
