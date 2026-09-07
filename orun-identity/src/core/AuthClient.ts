import type { SupabaseClient } from '@supabase/supabase-js';
import type { ISecureTokenStore } from '../storage/ISecureTokenStore';
import { TOKEN_STORE_KEYS } from '../storage/ISecureTokenStore';
import { AuditLogger } from './AuditLogger';
import type {
  AuthState,
  Membership,
  OAuthProvider,
  OrunUser,
  SignInParams,
  SignUpParams,
  Tenant,
} from '../types';

type Listener = (state: AuthState) => void;

export interface AuthClientConfig {
  supabase: SupabaseClient;
  tokenStore: ISecureTokenStore;
  /** Necessário no Desktop (service_role) e opcional no Mobile/TV (anon key delega ao host). */
  resolveTenantContext: (userId: string) => Promise<{
    activeTenant: Tenant;
    memberships: Membership[];
  }>;
}

export interface MFAEnrollResult {
  factorId: string;
  qrCode: string; // SVG data URI, pronto pra renderizar num <img>
  secret: string; // fallback textual pro usuário digitar manualmente
}

export interface MFAFactor {
  id: string;
  friendlyName: string | null;
  status: 'verified' | 'unverified';
}

/**
 * Wrapper central de autenticação. Todos os apps instanciam um AuthClient
 * injetando sua própria implementação de ISecureTokenStore — a lógica de
 * sign in/up/out, OAuth, magic link, refresh e MFA vive aqui uma única vez.
 */
export class AuthClient {
  private state: AuthState = {
    status: 'loading',
    user: null,
    activeTenant: null,
    memberships: [],
    accessToken: null,
  };

  private listeners = new Set<Listener>();
  private readonly auditLogger: AuditLogger;

  constructor(private readonly config: AuthClientConfig) {
    this.auditLogger = new AuditLogger(config.supabase);
  }

  getState(): AuthState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private setState(partial: Partial<AuthState>): void {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((l) => l(this.state));
  }

  /**
   * Deve ser chamado uma vez na inicialização do app. Tenta restaurar sessão
   * a partir do token store local antes de decidir status = unauthenticated.
   */
  async initialize(): Promise<void> {
    const { supabase, tokenStore } = this.config;

    const storedRefreshToken = await tokenStore.getItem(TOKEN_STORE_KEYS.REFRESH_TOKEN);

    if (!storedRefreshToken) {
      this.setState({ status: 'unauthenticated' });
      return;
    }

    const { data, error } = await supabase.auth.setSession({
      access_token: (await tokenStore.getItem(TOKEN_STORE_KEYS.ACCESS_TOKEN)) ?? '',
      refresh_token: storedRefreshToken,
    });

    if (error || !data.session) {
      await this.clearLocalSession();
      this.setState({ status: 'unauthenticated' });
      return;
    }

    await this.hydrateFromSession(data.session.access_token, data.session.refresh_token, data.session.user.id);

    // Reage a refresh automático do supabase-js mantendo o token store sincronizado.
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED' && session) {
        await tokenStore.setItem(TOKEN_STORE_KEYS.ACCESS_TOKEN, session.access_token);
        await tokenStore.setItem(TOKEN_STORE_KEYS.REFRESH_TOKEN, session.refresh_token);
        this.setState({ accessToken: session.access_token });
      }
      if (event === 'SIGNED_OUT') {
        await this.clearLocalSession();
        this.setState({
          status: 'unauthenticated',
          user: null,
          activeTenant: null,
          memberships: [],
          accessToken: null,
        });
      }
    });
  }

  async signUp(params: SignUpParams): Promise<void> {
    const { supabase } = this.config;
    const { data, error } = await supabase.auth.signUp({
      email: params.email,
      password: params.password,
      options: {
        data: { display_name: params.displayName },
        // Token do Cloudflare Turnstile, resolvido no client antes de chamar
        // signUp(). Requer CAPTCHA configurado no dashboard do Supabase
        // (Auth > Settings > Enable Captcha, provider Turnstile).
        captchaToken: params.captchaToken,
      },
    });
    if (error) throw error;
    if (!data.session) {
      // Confirmação de e-mail pendente — sem sessão ainda.
      this.setState({ status: 'unauthenticated' });
      return;
    }
    await this.persistAndHydrate(data.session.access_token, data.session.refresh_token, data.session.user.id);
  }

  async signIn(params: SignInParams): Promise<void> {
    const { supabase } = this.config;
    const { data, error } = await supabase.auth.signInWithPassword({
      email: params.email,
      password: params.password,
      options: { captchaToken: params.captchaToken },
    });
    if (error) {
      await this.auditLogger.log({
        eventType: 'login_failed',
        metadata: { email: params.email, reason: error.message },
      });
      throw error;
    }

    // Se o usuário tem MFA ativo, a sessão retornada fica em aal1 e precisa
    // de um segundo fator antes de ser considerada totalmente autenticada.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== aal.nextLevel) {
      this.setState({ status: 'mfa_required' });
      return;
    }

    await this.persistAndHydrate(data.session.access_token, data.session.refresh_token, data.session.user.id);
    await this.auditLogger.log({
      eventType: 'login_success',
      userId: data.session.user.id,
      metadata: { email: params.email },
    });
  }

  async signInWithOAuth(params: OAuthProvider): Promise<{ url: string }> {
    const { supabase } = this.config;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: params.provider,
      options: { redirectTo: params.redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    // Caller (app) é responsável por abrir data.url no browser/webview e,
    // no retorno do deep link, chamar completeOAuthSession() com o código.
    return { url: data.url };
  }

  async signInWithMagicLink(email: string, redirectTo?: string): Promise<void> {
    const { supabase } = this.config;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw error;
  }

  /** Chamado após o app receber o deep link de retorno do OAuth/magic link. */
  async completeSessionFromUrl(url: string): Promise<void> {
    const { supabase } = this.config;
    const { data, error } = await supabase.auth.exchangeCodeForSession(url);
    if (error) throw error;
    await this.persistAndHydrate(data.session.access_token, data.session.refresh_token, data.session.user.id);
  }

  // ─────────────────── Recuperação e troca de senha ───────────────────

  /** Envia e-mail com link de redefinição. Sempre retorna sucesso mesmo se o e-mail não existir (evita user enumeration). */
  async resetPasswordForEmail(email: string, redirectTo?: string): Promise<void> {
    const { supabase } = this.config;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    await this.auditLogger.log({ eventType: 'password_reset_requested', metadata: { email } });
  }

  /**
   * Troca a senha do usuário autenticado (usado tanto no fluxo pós-reset,
   * com a sessão temporária do link de recuperação, quanto na troca
   * voluntária dentro do app). Recomendado: chamar `verifyPassword` antes
   * quando for troca voluntária, para confirmar posse da senha atual.
   */
  async updatePassword(newPassword: string): Promise<void> {
    const { supabase } = this.config;
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    await this.auditLogger.log({
      eventType: 'password_changed',
      userId: this.state.user?.id,
      tenantId: this.state.activeTenant?.id,
    });
  }

  async resendEmailVerification(email: string): Promise<void> {
    const { supabase } = this.config;
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) throw error;
    await this.auditLogger.log({ eventType: 'email_verification_resent', metadata: { email } });
  }

  /**
   * Reautenticação leve para guardar ações críticas (troca de e-mail,
   * exclusão de conta, desativar MFA). Não altera a sessão atual — só
   * confirma que quem está pedindo a ação sabe a senha atual.
   */
  async verifyPassword(password: string): Promise<boolean> {
    const { supabase } = this.config;
    const email = this.state.user?.email;
    if (!email) throw new Error('[@orun/identity] verifyPassword chamado sem usuário autenticado.');

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return !error;
  }

  // ─────────────────────── Passkeys (WebAuthn, beta) ───────────────────────
  // Requer @supabase/supabase-js >= 2.105.0 e Passkeys habilitado no
  // dashboard (Authentication > Passkeys). API marcada como experimental
  // pelo próprio Supabase — pode mudar sem aviso em versões futuras.

  /** Executa a cerimônia WebAuthn de registro (browser/webview com suporte a navigator.credentials). */
  async registerPasskey(): Promise<void> {
    const { supabase } = this.config;
    const auth = supabase.auth as unknown as { registerPasskey?: () => Promise<{ error: unknown }> };
    if (!auth.registerPasskey) {
      throw new Error(
        '[@orun/identity] registerPasskey indisponível — confirme @supabase/supabase-js >= 2.105.0 e Passkeys habilitado no dashboard.'
      );
    }
    const { error } = await auth.registerPasskey();
    if (error) throw error;
    await this.auditLogger.log({
      eventType: 'passkey_enrolled',
      userId: this.state.user?.id,
      tenantId: this.state.activeTenant?.id,
    });
  }

  /** Login sem senha via passkey — o próprio picker do navegador lida com qual conta. */
  async signInWithPasskey(): Promise<void> {
    const { supabase } = this.config;
    const auth = supabase.auth as unknown as {
      signInWithPasskey?: () => Promise<{ data: { session: { access_token: string; refresh_token: string; user: { id: string } } } | null; error: unknown }>;
    };
    if (!auth.signInWithPasskey) {
      throw new Error(
        '[@orun/identity] signInWithPasskey indisponível — confirme @supabase/supabase-js >= 2.105.0 e Passkeys habilitado no dashboard.'
      );
    }
    const { data, error } = await auth.signInWithPasskey();
    if (error) throw error;
    if (!data?.session) throw new Error('[@orun/identity] signInWithPasskey não retornou sessão.');

    await this.persistAndHydrate(data.session.access_token, data.session.refresh_token, data.session.user.id);
    await this.auditLogger.log({ eventType: 'login_success', userId: data.session.user.id, metadata: { via: 'passkey' } });
  }

  async signOut(): Promise<void> {
    const { supabase } = this.config;
    const userId = this.state.user?.id ?? null;
    const tenantId = this.state.activeTenant?.id ?? null;
    await supabase.auth.signOut();
    await this.clearLocalSession();
    this.setState({
      status: 'unauthenticated',
      user: null,
      activeTenant: null,
      memberships: [],
      accessToken: null,
    });
    await this.auditLogger.log({ eventType: 'logout', userId, tenantId });
  }

  // ─────────────────────────── MFA / TOTP ───────────────────────────

  /**
   * Inicia o enrollment de um novo fator TOTP. O caller renderiza o
   * `qrCode` (SVG data URI) num app autenticador e chama
   * `verifyMFAEnrollment` com o código de 6 dígitos gerado.
   */
  async enrollMFA(friendlyName?: string): Promise<MFAEnrollResult> {
    const { supabase } = this.config;
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName,
    });
    if (error) throw error;
    return {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    };
  }

  /** Confirma o enrollment com o primeiro código gerado pelo app autenticador. */
  async verifyMFAEnrollment(factorId: string, code: string): Promise<void> {
    const { supabase } = this.config;
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) {
      await this.auditLogger.log({
        eventType: 'mfa_challenge_failed',
        userId: this.state.user?.id,
        tenantId: this.state.activeTenant?.id,
        metadata: { stage: 'enrollment', reason: error.message },
      });
      throw error;
    }
    await this.auditLogger.log({
      eventType: 'mfa_enrolled',
      userId: this.state.user?.id,
      tenantId: this.state.activeTenant?.id,
      metadata: { factorId },
    });
  }

  /**
   * Verifica o código TOTP durante o login (quando signIn() retornou
   * status = 'mfa_required'). Em caso de sucesso, hidrata o estado normal.
   */
  async verifyMFAChallenge(factorId: string, code: string): Promise<void> {
    const { supabase } = this.config;
    const { data, error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) {
      await this.auditLogger.log({
        eventType: 'mfa_challenge_failed',
        metadata: { stage: 'login', factorId, reason: error.message },
      });
      throw error;
    }

    await this.persistAndHydrate(data.access_token, data.refresh_token, data.user.id);
    await this.auditLogger.log({
      eventType: 'login_success',
      userId: data.user.id,
      metadata: { via: 'mfa' },
    });
  }

  async listMFAFactors(): Promise<MFAFactor[]> {
    const { supabase } = this.config;
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    return data.totp.map((f) => ({
      id: f.id,
      friendlyName: f.friendly_name ?? null,
      status: f.status,
    }));
  }

  async unenrollMFA(factorId: string): Promise<void> {
    const { supabase } = this.config;
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) throw error;
    await this.auditLogger.log({
      eventType: 'mfa_disabled',
      userId: this.state.user?.id,
      tenantId: this.state.activeTenant?.id,
      metadata: { factorId },
    });
  }

  private async persistAndHydrate(accessToken: string, refreshToken: string, userId: string): Promise<void> {
    const { tokenStore } = this.config;
    await tokenStore.setItem(TOKEN_STORE_KEYS.ACCESS_TOKEN, accessToken);
    await tokenStore.setItem(TOKEN_STORE_KEYS.REFRESH_TOKEN, refreshToken);
    await this.hydrateFromSession(accessToken, refreshToken, userId);
  }

  private async hydrateFromSession(accessToken: string, _refreshToken: string, userId: string): Promise<void> {
    const { supabase, resolveTenantContext } = this.config;

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    if (profileError) throw profileError;

    const { activeTenant, memberships } = await resolveTenantContext(userId);

    const user: OrunUser = {
      id: profile.id,
      email: profile.email,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
      mfaEnabled: profile.mfa_enabled,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    };

    this.setState({
      status: 'authenticated',
      user,
      activeTenant,
      memberships,
      accessToken,
    });
  }

  private async clearLocalSession(): Promise<void> {
    await this.config.tokenStore.clear();
  }
}
