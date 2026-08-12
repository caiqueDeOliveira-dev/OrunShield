# Orun Security & Optimization Suite — visão geral

Seis pacotes, dois sistemas independentes que compartilham a mesma filosofia de engenharia: **nunca destrutivo por padrão, sempre com área de espera antes de qualquer exclusão permanente, e proteção estrutural contra os próprios pontos cegos** (não só documentação sobre eles).

## Os dois sistemas

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

**Total: 115 testes automatizados, todos rodando de verdade neste ambiente (não só simulados) — incluindo o `apt` real do sistema operacional e filesystem real via `mkdtemp`.**

## Ordem recomendada de integração no `orun-monorepo`

1. `packages/shield-core` e `packages/system-optimizer` primeiro (não dependem de nada além de si mesmos)
2. `packages/sentinela-agent` e `packages/shield-mobile` (dependem de `shield-core`)
3. Os dois pacotes `-integration` por último — copiar os arquivos soltos pra dentro de `apps/desktop` e `packages/design-system` conforme os READMEs de cada um explicam
4. Mesclar os dois `preload.ts` (Shield e Optimizer) num só — cada um só adiciona uma chamada de `contextBridge.exposeInMainWorld`, não conflitam entre si
5. No `main.ts`: `initializeShield(mainWindow)` e `initializeOptimizer(shieldQuarantineDirName)` — nessa ordem, já que o Optimizer aceita opcionalmente o nome da pasta de quarentena do Shield pra também excluí-la dos próprios scans

## Variáveis de ambiente do ecossistema completo

| Variável | Usada por | Onde conseguir |
|---|---|---|
| `ORUN_VT_API_KEY` | `shield-core` (VirusTotal), `shield-mobile` (DownloadScanner) | virustotal.com/gui/join-us (gratuita) |
| `EXPO_PUBLIC_SAFE_BROWSING_KEY` | `shield-mobile` (LinkGuard) | Google Cloud Console |
| `EXPO_PUBLIC_VT_KEY` | `shield-mobile` (mesma chave do VT acima) | mesma de cima |
| Config do provider de IA (`ollama`/`anthropic`/`openai-compatible`) | `sentinela-agent` | depende do provider escolhido — Ollama não precisa de chave |

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
| Linux (este ambiente) | ClamAV, YARA, firewall (iptables, mockado com precisão), apt real, filesystem real | — |
| Windows | — (nenhum binário Windows disponível neste sandbox) | netsh, winget parsing, jail-monkey Android |
| macOS | — | PF firewall (não implementado, erro explícito), brew parsing |
| iOS/Android físico | — | root/jailbreak real, certificate pinning contra Supabase real |

Essa tabela é o roteiro dos testes que só você consegue fazer, fora deste sandbox.
