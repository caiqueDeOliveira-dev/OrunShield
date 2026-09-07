# @orun/identity

Camada centralizada de identidade e autenticação do ecossistema Orun OS. Wrapper sobre Supabase Auth com session registry multi-dispositivo e storage seguro por plataforma.

## Estrutura

```
src/
├── types/           # User, Tenant, Membership, Device, Session, Subscription, License
├── storage/
│   ├── ISecureTokenStore.ts   # interface comum
│   ├── electron.ts            # Desktop — safeStorage
│   ├── expo.ts                 # Mobile — expo-secure-store
│   └── webcrypto.ts            # TV/Tizen — Web Crypto AES-GCM
└── core/
    ├── AuthClient.ts           # sign in/up/out, OAuth, magic link, refresh
    └── SessionRegistry.ts      # registro/revogação de devices
```

## Integração no Desktop (passo a passo)

O objetivo desta fase é **migrar sem regressão** — o Desktop continua funcionando com Supabase Auth, só troca a implementação por trás do mesmo comportamento.

### 1. Instalar como dependência local

No `package.json` do app Desktop:

```json
{
  "dependencies": {
    "@orun/identity": "file:../../packages/identity"
  }
}
```

### 2. Implementar o backend de storage (main process)

O `ElectronSecureTokenStore` precisa de um `KeyValueBackend` — reaproveite o padrão que já existe para o token hardcoded do `social-media.cjs` que foi flagado para rotação. Sugestão: uma tabela SQLite dedicada (`secure_kv`) em vez de arquivo solto:

```ts
// main/secureKvBackend.ts
import Database from 'better-sqlite3';
import type { KeyValueBackend } from '@orun/identity';

export function createSqliteKvBackend(db: Database.Database): KeyValueBackend {
  db.exec(`create table if not exists secure_kv (key text primary key, value blob not null)`);

  return {
    async read(key) {
      const row = db.prepare('select value from secure_kv where key = ?').get(key) as
        | { value: Buffer }
        | undefined;
      return row?.value ?? null;
    },
    async write(key, value) {
      db.prepare(
        'insert into secure_kv (key, value) values (?, ?) on conflict(key) do update set value = excluded.value'
      ).run(key, value);
    },
    async delete(key) {
      db.prepare('delete from secure_kv where key = ?').run(key);
    },
    async clearAll() {
      db.exec('delete from secure_kv');
    },
  };
}
```

### 3. Inicializar o AuthClient no main process

```ts
// main/identity.ts
import { safeStorage } from 'electron';
import { createClient } from '@supabase/supabase-js';
import { AuthClient, ElectronSecureTokenStore } from '@orun/identity';
import { createSqliteKvBackend } from './secureKvBackend';
import { db } from './database'; // sua instância better-sqlite3 já existente

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Desktop mantém service_role no main process
);

const tokenStore = new ElectronSecureTokenStore(safeStorage, createSqliteKvBackend(db));

export const authClient = new AuthClient({
  supabase,
  tokenStore,
  resolveTenantContext: async (userId) => {
    const { data: memberships, error } = await supabase
      .from('memberships')
      .select('*, tenants(*)')
      .eq('user_id', userId);
    if (error) throw error;

    // Nos apps pessoais, hoje sempre há exatamente 1 membership (tenant de 1).
    const primary = memberships[0];
    return {
      activeTenant: primary.tenants,
      memberships,
    };
  },
});

authClient.initialize();
```

### 4. Expor via IPC para o renderer

Como o Desktop é Electron + React, o `AuthClient` roda no main process (onde já vive o `service_role`) e o renderer consome via IPC — **não** instancie um segundo `AuthClient` no renderer.

```ts
// main/ipc/auth.ts
import { ipcMain } from 'electron';
import { authClient } from '../identity';

ipcMain.handle('auth:signIn', (_e, params) => authClient.signIn(params));
ipcMain.handle('auth:signOut', () => authClient.signOut());
ipcMain.handle('auth:getState', () => authClient.getState());

authClient.subscribe((state) => {
  // Broadcast para todas as janelas abertas
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('auth:stateChanged', state));
});
```

### 5. Checklist de migração sem regressão

- [ ] Rodar o novo `AuthClient` em paralelo ao código antigo por uma release, comparando estados (log only, sem trocar comportamento)
- [ ] Migrar tokens já armazenados no formato antigo para as chaves do `TOKEN_STORE_KEYS` na primeira inicialização
- [ ] Confirmar que `mfa_enabled` e demais colunas de `users` já existem — se não, migration no Supabase antes de fazer deploy do client
- [ ] Rotacionar o token hardcoded de `social-media.cjs` **nesta mesma janela de deploy**, já usando o `secure_kv` novo
- [ ] Só remover o código antigo de auth depois de 1 release estável com o novo client

## Integração no Mobile (Expo/React Native)

Diferente do Desktop, no Mobile o `AuthClient` roda direto no processo do app (não há main/renderer separados), usando a **anon key** do Supabase — nunca `service_role`.

### 1. Instalar

```json
{
  "dependencies": {
    "@orun/identity": "file:../../packages/identity"
  }
}
```

### 2. Inicializar

```tsx
// src/identity.ts
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { AuthClient, ExpoSecureTokenStore } from '@orun/identity';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY! // nunca service_role no mobile
);

const tokenStore = new ExpoSecureTokenStore(SecureStore);

export const authClient = new AuthClient({
  supabase,
  tokenStore,
  resolveTenantContext: async (userId) => {
    const { data: memberships, error } = await supabase
      .from('memberships')
      .select('*, tenants(*)')
      .eq('user_id', userId);
    if (error) throw error;
    return { activeTenant: memberships[0].tenants, memberships };
  },
});
```

### 3. Consumir via hook

```tsx
// App.tsx
import { useAuth } from '@orun/identity';
import { authClient } from './src/identity';

function LoginScreen() {
  const { state, signIn } = useAuth(authClient);

  if (state.status === 'authenticated') return <HomeScreen />;
  return <LoginForm onSubmit={(email, password) => signIn({ email, password })} />;
}
```

### 4. Registrar device no SessionRegistry

```tsx
import * as Application from 'expo-application';
import { SessionRegistry } from '@orun/identity';

const registry = new SessionRegistry(supabase);

await registry.registerDevice({
  tenantId: state.activeTenant.id,
  userId: state.user.id,
  platform: 'mobile',
  name: Device.deviceName ?? 'Dispositivo Mobile',
  fingerprint: Application.androidId ?? (await Application.getIosIdForVendorAsync())!,
});
```

## Integração na TV (Tizen)

Tizen não tem um keychain nativo, então o `WebCryptoSecureTokenStore` precisa de material de chave derivado de um identificador estável do dispositivo (nunca hardcoded no bundle).

```ts
// identity.ts (Tizen)
import { createClient } from '@supabase/supabase-js';
import { AuthClient, WebCryptoSecureTokenStore } from '@orun/identity';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const tokenStore = new WebCryptoSecureTokenStore(indexedDbBackend); // implementar backend IndexedDB

// tizen.systeminfo ou webapis.productinfo.getDuid() como fonte estável
const deviceSecret = await getStableDeviceId();
const keyMaterial = await deriveKeyMaterial(deviceSecret); // ex: HKDF/PBKDF2 sobre o ID
await tokenStore.initialize(keyMaterial);

export const authClient = new AuthClient({ supabase, tokenStore, resolveTenantContext });
```

O restante do fluxo (`signIn`, `useAuth`, `SessionRegistry`) é idêntico ao Mobile — é por isso que a camada core não sabe em qual plataforma está rodando.

## Fase 3 — Billing (Stripe) e Entitlements

### Arquitetura: por que isso não vive todo no client

O `@orun/identity` (client-side) só **lê** subscriptions e entitlements do Supabase — nunca fala com a Stripe Secret Key diretamente. Duas Edge Functions (Deno, fora do pacote npm, em `edge-functions/`) fazem a parte sensível:

- **`create-checkout-session`**: o app chama isso autenticado para gerar a URL de checkout. Valida que o usuário é `owner`/`admin` do tenant antes de criar a sessão.
- **`stripe-webhook`**: recebe eventos da Stripe (`checkout.session.completed`, `customer.subscription.updated/deleted`) e sincroniza a tabela `subscriptions`. É a única fonte de verdade sobre status de pagamento — o client nunca escreve em `subscriptions` diretamente.

### 1. Deploy das Edge Functions

```bash
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook --no-verify-jwt

supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

Registrar o endpoint do webhook no dashboard da Stripe apontando pra URL da function `stripe-webhook`, escutando os eventos `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.

### 2. Popular `plans` e `entitlements` no Supabase

```sql
insert into plans (key, name, stripe_price_id, max_devices) values
  ('desktop_free', 'Desktop Free', null, 1),
  ('desktop_pro', 'Desktop Pro', 'price_XXXXXXXX', 3);

insert into entitlements (plan_id, feature_key, value)
  select id, 'ai_agents_max', '15'::jsonb from plans where key = 'desktop_pro';
insert into entitlements (plan_id, feature_key, value)
  select id, 'iptv_unlimited', 'true'::jsonb from plans where key = 'desktop_pro';
```

### 3. Iniciar checkout no app

```ts
const { data, error } = await supabase.functions.invoke('create-checkout-session', {
  body: {
    tenantId: state.activeTenant.id,
    priceId: 'price_XXXXXXXX',
    successUrl: 'orunos://billing/success',
    cancelUrl: 'orunos://billing/cancel',
  },
});
// abrir data.url no browser/webview do app
```

### 4. Consultar entitlements no app (paywall)

```tsx
import { useEntitlements } from '@orun/identity';

function AiAgentsScreen() {
  const { isActive, hasFeature, getLimit, loading } = useEntitlements(supabase, activeTenant?.id ?? null);

  if (loading) return <Spinner />;
  if (!hasFeature('iptv_unlimited')) return <PaywallBanner feature="Streams ilimitados" />;

  const maxAgents = getLimit('ai_agents_max', 3); // fallback conservador se plano não tiver a feature
  // ...
}
```

Depois de um checkout completar (deep link de retorno), chamar `refresh()` do hook pra forçar nova consulta em vez de esperar o próximo mount.

## Fase 4 — Licenciamento offline (Desktop/TV)

### Como funciona

1. O app autenticado chama a Edge Function `issue-license`, que assina um JWT (RS256) contendo `tenantId`, `deviceId`, `planKey` e `features` — validade de 7 dias
2. O app cacheia esse token localmente via `ISecureTokenStore` (mesma abstração de storage já usada pra access/refresh token)
3. Em cada boot, o `LicenseManager` verifica a assinatura **sem rede**, usando só a chave pública embutida no bundle
4. Se expirado mas dentro do grace period (default: 3 dias), o app funciona em modo degradado/com aviso; se passou do grace period, bloqueia
5. Quando há rede, `refresh()` busca um token novo; se falhar (offline), cai automaticamente na validação do cache

A chave privada nunca sai da Edge Function. A pública não é secreta — pode ir no bundle do app tranquilamente, ela só serve para verificar, não para assinar.

### 1. Gerar o par de chaves (uma vez)

```bash
openssl genrsa -out license_private.pem 2048
openssl pkcs8 -topk8 -nocrypt -in license_private.pem -out license_private_pkcs8.pem
openssl rsa -in license_private.pem -pubout -out license_public.pem

supabase secrets set LICENSE_PRIVATE_KEY_PEM="$(cat license_private_pkcs8.pem)"
supabase functions deploy issue-license
```

A `license_public.pem` vai para uma variável de build do Desktop/TV (ex: `LICENSE_PUBLIC_KEY_PEM` no `.env`), **não** é secret.

### 2. Emitir e cachear a licença no app

```ts
import { LicenseManager } from '@orun/identity';

const licenseManager = new LicenseManager({
  tokenStore,
  publicKeyPem: process.env.LICENSE_PUBLIC_KEY_PEM!,
  gracePeriodDays: 3,
  fetchFreshLicense: async () => {
    const { data, error } = await supabase.functions.invoke('issue-license', {
      body: { tenantId: state.activeTenant!.id, deviceId: currentDevice.id },
    });
    if (error) throw error;
    return data.token as string;
  },
});
```

### 3. Validar no boot do app

```ts
const result = await licenseManager.validateCached();

switch (result.status) {
  case 'valid':
    break; // segue normal
  case 'grace_period':
    showToleranceBanner(result.graceDaysRemaining);
    break;
  case 'expired':
  case 'invalid_signature':
  case 'missing':
    redirectToLoginOrBlock();
    break;
}

// Em paralelo, tentar renovar sem bloquear a UI:
licenseManager.refresh();
```

## Fase 5 — MFA/TOTP e Audit Log

### MFA (TOTP)

O `AuthClient` usa a API nativa de MFA do Supabase Auth — não reimplementa TOTP do zero. Fluxo de enrollment:

```ts
// 1. Iniciar enrollment
const { factorId, qrCode, secret } = await authClient.enrollMFA('iPhone do Caique');
// renderizar <img src={qrCode} /> ou mostrar `secret` pra digitação manual

// 2. Confirmar com o primeiro código gerado no app autenticador
await authClient.verifyMFAEnrollment(factorId, '123456');
```

Fluxo de login quando o usuário já tem MFA ativo:

```ts
await authClient.signIn({ email, password });

if (authClient.getState().status === 'mfa_required') {
  const factors = await authClient.listMFAFactors();
  // pedir o código de 6 dígitos pro usuário, usando factors[0].id
  await authClient.verifyMFAChallenge(factors[0].id, code);
  // status agora é 'authenticated'
}
```

Gerenciar fatores:

```ts
const factors = await authClient.listMFAFactors();
await authClient.unenrollMFA(factorId); // desativar MFA
```

**Nota de UX**: a Supabase Auth ainda não tem recovery codes nativos pra TOTP — se o usuário perder o dispositivo, o caminho é suporte manual (`unenroll` via `service_role` no backend). Vale considerar isso no fluxo de conta antes de forçar MFA obrigatório pra todos os usuários do Beauty.

### Audit Log

Todo evento sensível já é registrado automaticamente pelo `AuthClient` — não precisa chamar nada manualmente pros eventos padrão (`login_success`, `login_failed`, `logout`, `mfa_enrolled`, `mfa_disabled`, `mfa_challenge_failed`). O log é best-effort: se a escrita falhar, não derruba o fluxo do usuário, só emite um `console.warn`.

Pra eventos customizados (ex: troca de plano, dispositivo revogado por um admin):

```ts
import { AuditLogger } from '@orun/identity';

const auditLogger = new AuditLogger(supabase);
await auditLogger.log({
  tenantId: activeTenant.id,
  userId: currentUser.id,
  eventType: 'plan_changed',
  metadata: { from: 'desktop_free', to: 'desktop_pro' },
});
```

No Supabase, a tabela `audit_log` é append-only via RLS — os apps (Mobile/TV com anon key) só conseguem INSERT e SELECT do próprio tenant, nunca UPDATE/DELETE. Ver `orun-identity-schema.md`, seção 4 (RLS Policies), pelas policies exatas.

## Fase 6 — Recuperação de senha, LGPD e Passkeys

Origem: segunda checklist externa (via Gemini), comparada item a item contra o que já existia. Só entraram aqui as lacunas reais.

### Recuperação e troca de senha

```ts
// Esqueci minha senha
await authClient.resetPasswordForEmail('user@email.com', 'orunos://reset-password');

// Depois que o usuário abre o link e a sessão temporária é estabelecida:
await authClient.updatePassword('nova-senha-forte');

// Troca voluntária dentro do app (não veio de link de reset) — confirmar posse da senha atual antes:
const senhaConfere = await authClient.verifyPassword(senhaAtualDigitada);
if (senhaConfere) await authClient.updatePassword(novaSenha);

// Reenviar e-mail de verificação
await authClient.resendEmailVerification('user@email.com');
```

Todos esses eventos já caem automaticamente no `audit_log` (`password_reset_requested`, `password_changed`, `email_verification_resent`).

### Checagem de senha vazada (Have I Been Pwned)

Roda 100% client-side, sem servidor próprio — usa o modelo k-anonymity oficial da API pública (só os 5 primeiros caracteres do hash SHA-1 saem da sua máquina, nunca a senha):

```ts
import { checkPasswordPwned } from '@orun/identity';

const result = await checkPasswordPwned(password);
if (result.isPwned) {
  showWarning(`Essa senha apareceu em ${result.occurrences} vazamentos conhecidos.`);
}
// result.checkFailed indica que a API estava fora do ar — nunca bloqueie o cadastro por isso (fail-open).
```

Sugestão de uso: chamar no formulário de signup/troca de senha como aviso não-bloqueante, não como validação obrigatória.

### LGPD — portabilidade e exclusão de dados

Duas novas Edge Functions:

```bash
supabase functions deploy export-user-data
supabase functions deploy delete-account
```

```ts
import { PrivacyClient } from '@orun/identity';

const privacy = new PrivacyClient(supabase);

// Direito de portabilidade (LGPD art. 18, V)
const meusDados = await privacy.exportUserData();
// baixar como JSON, ou oferecer na tela de "Minha Conta > Exportar dados"

// Direito ao esquecimento (LGPD art. 18, VI)
const result = await privacy.requestAccountDeletion();
if (result.blocked) {
  // usuário é único owner de uma organização (Beauty) com outros membros
  showMessage(result.message); // pedir pra transferir titularidade primeiro
} else {
  // conta apagada — redirecionar pro logout/tela inicial
}
```

**Regra de negócio importante**: `delete-account` bloqueia a exclusão se o usuário for o único `owner` de um tenant `organization` com outros membros dependendo dele (caso do Beauty). Isso é intencional — ver comentário completo no topo de `delete-account/index.ts`.

### Passkeys (WebAuthn) — beta

O Supabase lançou suporte nativo a passkeys em beta (maio/2026), depois do corte de conhecimento usado pra desenhar as fases anteriores deste pacote — validei a API atual antes de implementar. **Requisitos**: `@supabase/supabase-js >= 2.105.0` e Passkeys habilitado em Authentication → Passkeys no dashboard (relying party ID = seu domínio).

```ts
// Cadastrar uma passkey (dispara Face ID / Touch ID / Windows Hello / chave física)
await authClient.registerPasskey();

// Login sem senha — o próprio picker do SO escolhe a conta
await authClient.signInWithPasskey();
```

Os métodos lançam um erro explícito se a versão do `@supabase/supabase-js` instalada for antiga demais (`registerPasskey`/`signInWithPasskey` não existem no client) — não falha silenciosamente.

**Por ser beta**, a API pode mudar sem aviso do lado do Supabase. Recomendo tratar como opt-in visível ("Adicionar passkey" nas configurações de segurança), não como fluxo obrigatório, até a API sair de beta.





