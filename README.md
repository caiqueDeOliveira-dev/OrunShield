# Orun Shield

Suíte de segurança e otimização para o ecossistema Orun. Antivírus (ClamAV), firewall, quarentena, otimizador de sistema e agente de IA para análise em linguagem natural.

## Arquitetura

```
orun-security-suite/
├── orun-shield-core/          # Motor principal: ClamAV, YARA, VirusTotal, firewall, quarentena
├── orun-sentinela-agent/      # Agente IA para análise de ameaças em linguagem natural
├── orun-shield-mobile/        # Segurança mobile: Safe Browsing, root/jailbreak detection, pinning
├── orun-system-optimizer/     # Otimizador: disco, limpeza, atualizações winget/brew/apt
├── orun-shield-app/           # App Electron standalone (v0.3.2)
├── orun-shield-integration/   # Integração Electron (para uso no Orun OS desktop)
└── orun-system-optimizer-integration/  # Integração do otimizador
```

## Pacotes

| Pacote | Descrição | Testes |
|--------|-----------|--------|
| `@orun/shield-core` | Scanner ClamAV, regras YARA, VirusTotal, firewall (netsh), quarentena | ~84 |
| `@orun/sentinela-agent` | Análise de ameaças via IA (linguagem natural) | ~6 |
| `@orun/shield-mobile` | Safe Browsing API, detecção root/jailbreak, certificate pinning | ~21 |
| `@orun/system-optimizer` | Limpeza de disco, pacotes desatualizados, atualizações de sistema | ~40 |
| `orun-shield-app` | App Electron standalone com UI React + Tailwind | smoke-test |

## Como rodar

### Testes (todos os pacotes)

```bash
npm test
```

### Testes individuais

```bash
npm run test:core        # Shield Core
npm run test:sentinela   # Sentinela Agent
npm run test:mobile      # Shield Mobile
npm run test:optimizer   # System Optimizer
```

### App standalone

```bash
npm run dev:app          # Development mode
npm run build:app        # Build renderer
npm run dist:app         # Gerar instalador Windows
```

## Features

### Shield Core
- Scanner de arquivos via ClamAV (download automático de definições)
- Regras YARA para detecção customizada
- Análise via VirusTotal API
- Firewall Windows (netsh advfirewall) — bloqueio de IPs
- Sistema de quarentena ( mover + desinfectar)

### Sentinela Agent
- Interface em linguagem natural para analisar ameaças
- "O que esse arquivo faz?" → análise detalhada
- Integração com o agente Cyber Security do Orun OS

### System Optimizer
- Análise de uso de disco
- Limpeza de arquivos temporários
- Lista de pacotes desatualizados (winget/brew/apt)
- Atualizações de sistema

### App Standalone
- UI React + Tailwind com tema preto + vermelho-sangue
- Tray de sistema (minimiza para bandeja)
- Auto-update de definições ClamAV (24h)
- Sandbox + CSP para segurança

## Stack

- **Core**: TypeScript, Node.js, better-sqlite3
- **App**: Electron 31, React 18, Vite 6, Tailwind 4
- **Testes**: Vitest
- **Build**: electron-builder (NSIS)

## Status

- **v0.3.2** — App standalone funcional
- ~151 testes nos pacotes core
- UI redesign completo (preto glossy + vermelho-sangue neon)
- Hardening: sandbox, CSP, validação IPC, tray

## Licença

Privado — Ecossistema Orun
