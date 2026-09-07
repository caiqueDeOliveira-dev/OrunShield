/**
 * Tipos centrais do @orun/identity.
 * Espelham o schema definido em orun-identity-schema.md — qualquer mudança
 * de nome/campo deve ser refletida em ambos os lugares.
 */

export type TenantType = 'personal' | 'organization';
export type MemberRole = 'owner' | 'admin' | 'staff' | 'client' | 'viewer';
export type DevicePlatform = 'desktop' | 'mobile' | 'tv' | 'kiosk' | 'web';
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete';

export interface OrunUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  mfaEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Tenant {
  id: string;
  type: TenantType;
  name: string;
  slug: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Membership {
  id: string;
  userId: string;
  tenantId: string;
  role: MemberRole;
  invitedBy: string | null;
  joinedAt: string;
}

export interface Device {
  id: string;
  tenantId: string;
  userId: string;
  platform: DevicePlatform;
  name: string;
  fingerprint: string;
  lastSeenAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface Session {
  id: string;
  deviceId: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface Entitlement {
  featureKey: string;
  value: unknown;
}

export interface Subscription {
  id: string;
  tenantId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface License {
  id: string;
  tenantId: string;
  deviceId: string;
  signedToken: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

/** Payload decodificado do JWT de licença, após verificação de assinatura. */
export interface LicensePayload {
  tenantId: string;
  deviceId: string;
  planKey: string;
  features: Record<string, unknown>;
  issuedAt: number;
  expiresAt: number;
}

export type LicenseValidationStatus =
  | 'valid'
  | 'grace_period'
  | 'expired'
  | 'invalid_signature'
  | 'missing';

export interface LicenseValidationResult {
  status: LicenseValidationStatus;
  payload: LicensePayload | null;
  /** Dias restantes de tolerância offline, só relevante quando status = 'grace_period'. */
  graceDaysRemaining?: number;
}

/**
 * Estado de auth resolvido — o que os apps consomem via useAuth()/AuthClient.getState().
 */
export interface AuthState {
  status: 'loading' | 'authenticated' | 'unauthenticated' | 'mfa_required';
  user: OrunUser | null;
  activeTenant: Tenant | null;
  memberships: Membership[];
  accessToken: string | null;
}

export interface SignUpParams {
  email: string;
  password: string;
  displayName?: string;
  /** Token do Cloudflare Turnstile, resolvido no client (widget invisível). */
  captchaToken?: string;
}

export interface SignInParams {
  email: string;
  password: string;
  /** Turnstile também pode ser exigido no login após N tentativas falhas. */
  captchaToken?: string;
}

export interface OAuthProvider {
  provider: 'google' | 'github' | 'discord';
  redirectTo?: string;
}
