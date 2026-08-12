# @orun/shield-mobile

Camada de segurança mobile do Orun OS. Diferente do `@orun/shield-core` (desktop), este pacote respeita as restrições reais de sandboxing do iOS/Android: **não tenta escanear o sistema de arquivos, monitorar outros apps ou rodar em background continuamente** — nenhum antivírus mobile do mercado (Avast, Norton, Kaspersky mobile) faz isso, porque a plataforma não permite.

## O que este pacote faz (e o que não faz)

| Faz | Não faz |
|---|---|
| Verifica URLs contra Google Safe Browsing antes de abrir em WebView | Escanear todos os arquivos do dispositivo |
| Detecta root/jailbreak/hooking (Frida/Xposed) via `jail-monkey` | Monitorar processos de outros apps |
| Checa hash de arquivos que o próprio app Orun recebe (anexos, downloads pontuais) | Rodar scan contínuo em background |
| Cache local de resultados de URL (reduz chamadas de API) | Bloquear ameaças de outros apps no dispositivo |

## Módulos

### `SafeBrowsingClient` + `LinkGuard`
```typescript
import { LinkGuard } from "@orun/shield-mobile";
import { WebView } from "react-native-webview";

const linkGuard = new LinkGuard({ safeBrowsingApiKey: process.env.EXPO_PUBLIC_SAFE_BROWSING_KEY! });

<WebView
  source={{ uri }}
  onShouldStartLoadWithRequest={(request) => {
    // onShouldStartLoadWithRequest precisa ser síncrono na API da lib —
    // então a checagem real deve rodar ANTES da navegação, ver padrão abaixo.
    return true;
  }}
/>

// Padrão recomendado: checar antes de montar a WebView, ou interceptar o
// clique no link (ex: numa lista de resultados) antes de navegar:
async function handleLinkPress(url: string) {
  const allowed = await linkGuard.shouldAllowNavigation(url);
  if (!allowed) {
    Alert.alert("Link bloqueado", "Este link foi identificado como potencialmente perigoso.");
    return;
  }
  navigation.navigate("WebViewScreen", { url });
}
```

**Nota de arquitetura:** `onShouldStartLoadWithRequest` do `react-native-webview` é síncrono, então não dá para fazer um `await` dentro dele. O padrão acima (checar antes de navegar, na ação que dispara a navegação) é o correto. Se o app precisar interceptar navegação *dentro* da própria WebView (ex: usuário clica em link dentro da página carregada), é preciso manter um cache pré-aquecido ou aceitar uma checagem levemente assíncrona com um loading state.

### `DeviceIntegrityChecker`
```typescript
import { DeviceIntegrityChecker } from "@orun/shield-mobile";
import { Platform } from "react-native";

// No boot do app (App.tsx ou equivalente):
const checker = new DeviceIntegrityChecker(undefined, Platform.OS === "ios" ? "ios" : "android");
const integrity = await checker.check();

if (integrity.isCompromised) {
  // Decisão de produto: bloquear funcionalidades sensíveis (ex: não sincronizar
  // dados sensíveis via Supabase num device rooted/jailbroken), ou só alertar.
  // Apps bancários geralmente bloqueiam login; para o Orun, um alerta pode bastar.
}
```

**Descoberta na validação**: a API real do `jail-monkey` tem `isDebuggedMode()` retornando `Promise<boolean>` (não síncrono como eu tinha assumido inicialmente) — corrigido e coberto por teste antes de chegar no seu ambiente.

### `DownloadScanner`
```typescript
import { DownloadScanner } from "@orun/shield-mobile";
import * as FileSystem from "expo-file-system";

const scanner = new DownloadScanner({ virusTotalApiKey: process.env.EXPO_PUBLIC_VT_KEY! });

const content = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
const result = await scanner.checkFile(fileName, content);
if (result.verdict === "malicious") {
  // não abrir o arquivo, alertar o usuário
}
```

Reaproveita o `VirusTotalClient` já existente no `@orun/shield-core` — mesma lógica do desktop, sem duplicar código. Diferente do desktop, aqui só consulta hash (não faz upload de arquivo desconhecido sem consentimento explícito do usuário — mobile é mais sensível a isso).

### `CertificatePinningManager`

Protege as chamadas do app para Supabase/Edge Functions contra ataques MITM (ex: numa rede Wi-Fi pública comprometida). Usa `react-native-ssl-public-key-pinning` (OkHttp CertificatePinner no Android, TrustKit no iOS).

**Limitações reais — leia antes de usar:**
1. **Não funciona no Expo Go.** Exige development build ou production build (`npx expo run:ios`/`run:android`, ou EAS Build), porque a lib tem código nativo. Use `isAvailable()` para checar em runtime sem quebrar o app no Expo Go.
2. No iOS, o Network Inspector do `expo-dev-client` interfere com o pinning em builds de dev — precisa desabilitar via `expo-build-properties` (config abaixo). Em produção já vem desabilitado automaticamente.
3. **Pins expiram** quando o certificado do servidor é renovado — um app com pins desatualizados simplesmente para de falar com o backend. Sempre configure `expirationDate` e tenha um plano de atualização via OTA (EAS Update) antes do certificado trocar. Sempre inclua pelo menos 2 hashes por domínio (o atual + um de backup/renovação) — a própria lib exige isso no iOS.

```typescript
import { CertificatePinningManager, buildOrunPinningConfig } from "@orun/shield-mobile";

const pinning = new CertificatePinningManager();

// No componente raiz do app, o mais cedo possível:
if (await pinning.isAvailable()) {
  const config = buildOrunPinningConfig({
    supabaseProjectHost: "xxxxx.supabase.co",
    supabasePublicKeyHashes: ["<hash-atual>==", "<hash-backup>=="],
  });
  const result = await pinning.initialize(config);
  if (!result.initialized) {
    console.warn("Certificate pinning não inicializou:", result.error);
  }
} else {
  console.log("Pinning indisponível (Expo Go ou build sem o módulo nativo) — seguindo sem proteção extra.");
}
```

**Config no `app.json` (necessária para builds de desenvolvimento no iOS):**
```json
{
  "expo": {
    "plugins": [
      ["expo-build-properties", { "ios": { "networkInspector": false } }]
    ]
  }
}
```

**Como extrair os hashes de chave pública (SPKI) do seu domínio Supabase:**
```bash
# Substitua xxxxx.supabase.co pelo seu host real
openssl s_client -connect xxxxx.supabase.co:443 -servername xxxxx.supabase.co </dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```
Isso gera o hash do certificado **atual**. Para o pin de backup, repita o processo contra o certificado da autoridade certificadora intermediária ou aguarde a renovação — o objetivo do segundo pin é justamente não quebrar o app quando o certificado principal for trocado.

## Variáveis de ambiente necessárias

- `EXPO_PUBLIC_SAFE_BROWSING_KEY` — [Google Cloud Console](https://console.cloud.google.com/apis/library/safebrowsing.googleapis.com), gratuita
- `EXPO_PUBLIC_VT_KEY` — mesma API key da VirusTotal já usada no desktop

Nota: variáveis `EXPO_PUBLIC_*` ficam embutidas no bundle do app (client-side) — são chaves com quota limitada mas públicas por natureza nesse modelo. Se o volume de uso crescer, considere proxear as chamadas via uma Supabase Edge Function (mesmo padrão já usado no `ai-relay` do Hampton mobile), mantendo a key só no backend.

## Auditoria de dependências (npm audit)

`shield-core` e `sentinela-agent`: **0 vulnerabilidades**.

`shield-mobile`: **10 vulnerabilidades moderadas**, todas na mesma cadeia transitiva: `expo` → `@expo/cli`/`@expo/config-plugins` → `xcode@3.0.1` → `uuid@7.0.3` (CVE-2026-41907 / [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) — falta de validação de limites do buffer nas funções `v3()`/`v5()`/`v6()` do `uuid`, corrigido só a partir do `uuid@14.0.0`).

Contexto que importa antes de decidir o que fazer:
- **Não há fix disponível ainda**: confirmei que até a versão *nightly* mais recente do `xcode` (`3.0.2-nightly...`) continua fixada em `uuid@^7.0.3`. `npm audit fix` não resolve isso — quem precisa atualizar é o pacote `xcode` (mantido pela comunidade CocoaPods/Facebook, não pela Expo diretamente).
- **`xcode` é uma ferramenta de build-time, não roda no app**: é usada pelo `@expo/config-plugins` para editar arquivos de projeto `.xcodeproj` durante `expo prebuild`/`expo run:ios` — no seu computador de desenvolvimento, não dentro do bundle JS que vai pro dispositivo do usuário final. Isso reduz bastante o risco prático (não é uma superfície de ataque exposta a quem usa o app).
- **Não é específico deste pacote**: qualquer projeto Expo/React Native que use `expo-crypto`, `expo-device` etc (que dependem de `expo` como peer) herda essa mesma cadeia — não é algo introduzido pelo `@orun/shield-mobile`.

Recomendação: acompanhar o [advisory do uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq) e a issue correspondente no repositório do `xcode`/Expo; não há ação de código a fazer aqui até que o upstream libere um fix. Rodar `npm audit` de novo periodicamente é a forma de saber quando isso mudar.

## Validação feita

21 testes passando: `SafeBrowsingClient`, `LinkGuard`, `DeviceIntegrityChecker`, e `CertificatePinningManager`. Todos rodam em Node puro via mocks — as libs nativas (`jail-monkey`, `react-native-ssl-public-key-pinning`, Expo) só funcionam de fato dentro de um runtime React Native real, então a validação final de comportamento nativo precisa ser feita em device físico/build de desenvolvimento.

Duas correções que a validação pegou antes de chegar no seu ambiente:
- `jail-monkey.isDebuggedMode()` retorna `Promise<boolean>`, não síncrono como eu tinha assumido inicialmente.
- A versão que eu tinha colocado pra `react-native-ssl-public-key-pinning` (`^1.6.0`) não existe — a mais recente publicada é `1.2.6`. Corrigido conferindo direto no registry do npm antes de fechar o pacote.

## Próximos passos sugeridos

1. Integrar como workspace (`packages/shield-mobile`) e adicionar dependência em `@orun/mobile-app`
2. Testar `DeviceIntegrityChecker` num Android rooteado real (emulador com root, ou device físico) e num iPhone jailbroken se disponível
3. Rodar `npx expo prebuild` + development build para validar o `CertificatePinningManager` de ponta a ponta contra o Supabase real, com os hashes extraídos via `openssl`
4. Definir a política de produto para quando `DeviceIntegrityChecker` detectar comprometimento: bloquear sync sensível, só alertar, ou ambos dependendo da severidade
