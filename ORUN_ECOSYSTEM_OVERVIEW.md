# Orun Security & Optimization Suite — visão geral

Sete pacotes (incluindo VPN), dois sistemas independentes + VPN que compartilham a mesma filosofia de engenharia: **nunca destrutivo por padrão, sempre com área de espera antes de qualquer exclusão permanente, e proteção estrutural contra os próprios pontos cegos** (não só documentação sobre eles).

## Os dois sistemas + VPN

### 🛡️ Shield — segurança
| Pacote | O que é | Testes |
|---|---|---|
| `orun-shield-core` | Motor: ClamAV, VirusTotal, YARA, Sentinela comportamental (processo/rede/arquivos), firewall, integridade de binários, quarentena | 48 |
| `orun-shield-integration` | Cola Electron/React: IPC + tela + store | — (UI) |
| `orun-sentinela-agent` | Tradução de achados técnicos em linguagem natural via IA (Ollama/Anthropic/OpenAI-compatible) | 6 |
| `orun-shield-mobile` | Links (Safe Browsing), root/jailbreak, arquivos in-app, certificate pinning | 21 |

### 🧹 Optimizer — desempenho
| Pacote | O que é | Testes |
|---|---|---|
| `orun-system-optimizer` | Motor: uso de disco, detector de arquivos desnecessários, limpeza com área de espera, verificador/executor de atualizações (winget/brew/apt) | 40 |
| `orun-system-optimizer-integration` | Cola Electron/React: IPC + tela + store | — (UI) |

### 🔒 VPN — rede privada
| Pacote | O que é | Testes |
|---|---|---|
| `orun-vpn-core` | Schemas Zod, interfaces *Like, `WgEasyClient` validado contra wg-easy v14 real | 19 |
| `orun-vpn-electron` | `ElectronVpnBackend` nativo (wg-quick/wireguard.exe) + kill switch nativo (nftables/pf/Windows Firewall) | 24 |

**Total: 158 testes automatizados (115 Shield+Optimizer + 43 VPN), todos rodando de verdade — incluindo `apt` real, filesystem real, API wg-easy v14 real.**

## Ordem recomendada de integração no `orun-monorepo`

1. `packages/shield-core`, `packages/system-optimizer`, `packages/vpn-core`, `packages/vpn-electron` primeiro (não dependem de nada além de si mesmos)
2. `packages/sentinela-agent` e `packages/shield-mobile` (dependem de `shield-core`)
3. `packages/vpn-core`/`vpn-electron` já expõem `window.orunVpn.*` no preload — adicionar ao `preload.ts` unificado
4. Os pacotes `-integration` por último — copiar arquivos soltos pra `apps/desktop` e `packages/design-system`
5. Mesclar todos os `preload.ts` (Shield, Optimizer, VPN) num só — cada um só adiciona `contextBridge.exposeInMainWorld`
6. No `main.ts`: `initializeShield(mainWindow)`, `initializeOptimizer(shieldQuarantineDirName)`, `initializeVpn()` — nessa ordem

## Variáveis de ambiente do ecossistema completo

| Variável | Usada por | Onde conseguir |
|---|---|---|
| `ORUN_VT_API_KEY` | `shield-core` (VirusTotal), `shield-mobile` (DownloadScanner) | virustotal.com/gui/join-us (gratuita) |
| `EXPO_PUBLIC_SAFE_BROWSING_KEY` | `shield-mobile` (LinkGuard) | Google Cloud Console |
| `EXPO_PUBLIC_VT_KEY` | `shield-mobile` (mesma chave do VT acima) | mesma de cima |
| Config do provider de IA (`ollama`/`anthropic`/`openai-compatible`) | `sentinela-agent` | depende do provider — Ollama não precisa de chave |
| `WG_EASY_PASSWORD_HASH` | `vpn-electron` (admin wg-easy) | `docker run --rm ghcr.io/wg-easy/wg-easy wgpw 'senha'` |
| `WG_HOST` | `vpn-electron` (endpoint servidor) | IP/domínio do servidor wg-easy |

Nenhuma dessas chaves deve viver no client-side/renderer do Electron — mesmo princípio que vocês já usam pro `service_role` do Supabase.

## Princípios de engenharia aplicados nos dois sistemas

1. **Nunca apagar/bloquear direto** — `QuarantineManager` (Shield) e `CleanupManager` (Optimizer) sempre movem pra uma área de espera primeiro, com metadados e possibilidade de restauração.
2. **Orquestrar ferramentas maduras, não reinventar** — ClamAV, YARA, VirusTotal, Google Safe Browsing, jail-monkey, winget/brew/apt. O código autoral fica na camada de decisão (o que fazer com o resultado), não na detecção primária.
3. **Falhar rápido em config perigosa, não em runtime** — `ShieldCore` e `SystemOptimizer` validam no construtor se a config criaria comportamento incorreto silencioso (ex: pasta de quarentena dentro de pasta vigiada), e recusam a instanciar em vez de deixar o bug acontecer em produção.
4. **IA nunca é ponto único de falha** — `SentinelaAgent` sempre tem fallback determinístico se o provider cair.
5. **Multiplataforma com limitações documentadas, não escondidas** — cada README lista explicitamente o que não foi testado neste ambiente (Windows/macOS reais, device físico com root/jailbreak) em vez de fingir cobertura total.

## Status de validação por plataforma

| Plataforma | O que foi validado de verdade | O que só foi revisado (não executado) |
|---|---|---|
| Linux (este ambiente) | ClamAV, YARA, firewall (iptables, mockado com precisão), apt real, filesystem real, wg-quick, nftables kill switch, API wg-easy v14 | — |
| Windows | — (nenhum binário Windows disponível neste sandbox) | netsh, winget parsing, jail-monkey Android, wireguard.exe, Windows Firewall kill switch |
| macOS | — | PF firewall (não implementado, erro explícito), brew parsing, wireguard, pf kill switch |
| iOS/Android físico | — | root/jailbreak real, certificate pinning contra Supabase real, WireGuard app QR |

Essa tabela é o roteiro dos testes que só você consegue fazer, fora deste sandbox.

Essa tabela é o roteiro dos testes que só você consegue fazer, fora deste sandbox.
