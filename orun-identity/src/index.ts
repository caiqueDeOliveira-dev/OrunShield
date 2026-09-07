export * from './types';
export * from './storage/ISecureTokenStore';
export { AuthClient } from './core/AuthClient';
export type { AuthClientConfig, MFAEnrollResult, MFAFactor } from './core/AuthClient';
export { SessionRegistry } from './core/SessionRegistry';
export { AuditLogger } from './core/AuditLogger';
export type { AuditEventType, AuditLogEntry } from './core/AuditLogger';

export { ElectronSecureTokenStore } from './storage/electron';
export type { ElectronSafeStorage, KeyValueBackend as ElectronKeyValueBackend } from './storage/electron';

export { ExpoSecureTokenStore } from './storage/expo';
export type { ExpoSecureStoreModule } from './storage/expo';

export { WebCryptoSecureTokenStore } from './storage/webcrypto';
export type { KeyValueBackend as WebCryptoKeyValueBackend } from './storage/webcrypto';

export { useAuth, useAuthBridge } from './hooks/useAuth';
export type { AuthBridge } from './hooks/useAuth';

export { EntitlementsResolver } from './core/EntitlementsResolver';
export type { Plan, ResolvedEntitlements } from './core/EntitlementsResolver';

export { useEntitlements } from './hooks/useEntitlements';

export { LicenseManager } from './core/LicenseManager';
export type { LicenseManagerConfig } from './core/LicenseManager';

export { PrivacyClient } from './core/PrivacyClient';
export type { AccountDeletionResult, AccountDeletionBlockedResult } from './core/PrivacyClient';

export { checkPasswordPwned } from './core/passwordSecurity';
export type { PwnedCheckResult } from './core/passwordSecurity';
