# @orun/shield-core

Suite de segurança desktop do Orun OS. Orquestra engines de detecção já testadas em produção (não reimplementa antivírus do zero) e adiciona uma camada comportamental própria (Sentinela) e de integridade específica do ecossistema Orun.

## Arquitetura

```
Detecção por assinatura     Comportamental (Sentinela)     Resposta
┌─────────────┐             ┌──────────────────┐          ┌────────────┐
│  ClamAV     │             │  ProcessMonitor   │          │  Firewall  │
│  VirusTotal │────┐    ┌───│  NetworkMonitor   │───┐  ┌───│  Manager   │
│  YARA       │    │    │   │  FileIntegrity    │   │  │   └────────────┘
└─────────────┘    │    │   └──────────────────┘   │  │
                    ▼    ▼                          ▼  ▼
                 ┌──────────────────────────────────────┐
                 │            ShieldCore                 │
                 │  (orquestrador — emite ShieldEventMap) │
                 └──────────────────────────────────────┘
                                   │
                        Integrity (BinaryVerifier)
                     protege os próprios binários do Orun
```

## Dependências de sistema (fora do npm)

Estas engines não são bibliotecas npm — são binários que precisam estar instalados no host:

| Módulo | Binário necessário | Instalação |
|---|---|---|
| `ClamAVScanner` | `clamscan` / `clamdscan` + `freshclam` | Linux: `apt install clamav clamav-daemon`. Windows/macOS: build oficial em [clamav.net](https://www.clamav.net/downloads) |
| `YaraEngine` | `yara` | Linux: `apt install yara`. macOS: `brew install yara`. Windows: build oficial em [virustotal.github.io/yara](https://virustotal.github.io/yara/) |
| `FirewallManager` | `netsh` (Windows, nativo) / `iptables` (Linux, geralmente já presente) | — |
| `VirusTotalClient` | Nenhum binário — API key gratuita/paga em [virustotal.com](https://www.virustotal.com/gui/join-us) | — |

O `ShieldCore` só instancia os módulos com dependência externa (`clamav`, `virustotal`, `yara`) se a config correspondente for passada — então o app pode detectar em runtime se o binário existe (`checkAvailability()`) e degradar graciosamente.

## Uso básico

```typescript
import { ShieldCore } from "@orun/shield-core";

const shield = new ShieldCore({
  clamav: { useDaemon: false },
  virustotal: { apiKey: process.env.VT_API_KEY! },
  yara: { rulesDir: "./rules" },
  sentinel: {
    process: { cpuThresholdPercent: 75, allowlist: ["node.exe", "electron.exe"] },
    network: { allowlistHosts: ["your-project.supabase.co"] },
    fileIntegrity: { watchPaths: [appStartupFolder, orunInstallFolder] },
  },
  autoBlockCriticalNetworkThreats: false, // true = bloqueia IP automaticamente em ameaça crítica
});

// Dashboard React consome isso via IPC (Electron) ou diretamente no main process
shield.on("threat:detected", (finding) => {
  console.log(`[${finding.severity}] ${finding.title}`);
  // Persistir via @orun/supabase-sync, notificar o usuário, etc.
});

shield.startMonitoring(); // liga Sentinela (processo, rede, integridade de arquivos)

// Scan sob demanda (ex: usuário clicou "Escanear Downloads")
const result = await shield.fullScan("/home/user/Downloads");
```

## Verificação de integridade do próprio Orun

```typescript
import { BinaryVerifier } from "@orun/shield-core";

// No pipeline de CI/release:
const verifier = new BinaryVerifier();
const manifest = await verifier.generateManifest("./dist");
await verifier.saveManifest(manifest, "./dist/shield-manifest.json");
// Publicar o manifesto assinado junto do instalador (ex: GitHub Release assets)

// No app, no startup:
const referenceManifest = await verifier.loadManifest(downloadedManifestPath);
const violations = await verifier.verify(installDir, referenceManifest);
if (violations.length > 0) {
  // alertar usuário: binário pode ter sido adulterado
}
```

**Importante:** o manifesto de referência deve vir de uma fonte externa (ex: baixado do servidor de release), nunca gerado localmente no momento da verificação — senão um binário já comprometido poderia gerar seu próprio manifesto "válido".

## Limitações conhecidas e caminho para o SO próprio

- **Firewall**: hoje orquestra `netsh`/`iptables` do SO hospedeiro. Quando o Orun OS tiver kernel próprio, esta camada deve ser substituída por controle nativo direto (ex: netfilter hooks no Linux, ou stack de rede própria).
- **macOS**: `FirewallManager` ainda não implementa PF (Packet Filter) — requer edição de `/etc/pf.conf`, não exposto via CLI simples como no Windows/Linux. Marcado como TODO.
- **Privilégios**: `FirewallManager` requer admin/root. O app precisa solicitar elevação (UAC no Windows, `sudo`/polkit no Linux) antes de chamar `addRule`/`removeRule`.
- **ClamAV em modo daemon** (`useDaemon: true`) é significativamente mais rápido para scans repetidos (evita recarregar a base de assinaturas a cada chamada) — recomendado para produção, mas requer `clamd` rodando como serviço.
- **YARA rules**: apenas um exemplo (`rules/example_suspicious_powershell.yar`) está incluído. O valor real desse módulo cresce conforme vocês adicionarem regras baseadas em casos reais.

## Validação real (feita em ambiente Linux com ClamAV 1.5.3 + YARA 4.5.0 instalados)

Além dos 13 testes unitários (que mockam os binários), o pacote foi validado contra os binários reais. Achados:

- `checkAvailability()` funciona corretamente (`{ available: true, version: 'ClamAV 1.5.3' }`).
- `YaraEngine.scan()` detectou corretamente a regra de exemplo contra um arquivo de teste com padrão de PowerShell ofuscado.
- **Bug real corrigido**: `"error"` é um nome de evento reservado no `EventEmitter` nativo do Node — se emitido sem nenhum listener registrado, o Node lança a exceção em vez de só notificar (diferente de qualquer outro evento). Isso derrubaria a aplicação de forma confusa se algum consumidor do Shield esquecesse de fazer `.on("error", ...)`. Corrigido com um listener no-op padrão no `TypedEmitter` — não interfere se você registrar seu próprio handler.
- **Mensagem de erro melhorada**: quando o ClamAV falha por falta de base de assinaturas (`/var/lib/clamav` vazio, antes do primeiro `freshclam`), o erro agora é explícito ("rode freshclam antes do primeiro scan") em vez do stderr bruto do processo.
- `updateDefinitions()` (freshclam) não pôde ser testado de ponta a ponta neste ambiente porque o CDN do ClamAV bloqueou a rede sandbox (`403 Forbidden by CDN` — restrição do ambiente de execução, não do código). **No seu ambiente real isso deve funcionar normalmente** — vale só confirmar rodando `updateDefinitions()` uma vez antes do primeiro scan em produção.

## Anti-Ransomware Heurístico (detecção, não prevenção em tempo real)

**Leia isto antes de usar** — é a distinção mais importante do módulo:

```
NÃO é: um driver interceptando escritas em disco ANTES delas acontecerem
       (isso exigiria um minifilter de kernel assinado — fora do
       alcance de uma aplicação em user-space, é o que separa um
       antivírus comercial "de verdade" do que dá pra construir aqui)

É:     detecção REATIVA — o ransomware já começou a criptografar
       quando o alerta dispara. Ainda tem valor real: ransomware
       tipicamente atinge milhares de arquivos em segundos/minutos,
       então pegar o INÍCIO de um ataque em massa (em vez de só o
       fim) pode dar tempo de desconectar da rede e preservar o
       que ainda não foi atingido.
```

Duas heurísticas, sem depender de assinatura prévia — exatamente o exemplo citado na pesquisa que originou este módulo ("processo tentou criptografar 4.000 arquivos em 20 segundos"):

```typescript
const shield = new ShieldCore({
  sentinel: {
    ransomwareHeuristic: {
      watchPaths: [documentsPath, desktopPath, picturesPath], // alvos clássicos de ransomware
      fileEventThreshold: 20, // 20+ eventos de arquivo...
      windowMs: 10_000,       // ...em 10 segundos = alerta
      cooldownMs: 60_000,     // não repete alerta do mesmo ataque em andamento
    },
  },
});
```

1. **Taxa de eventos anormal**: N arquivos modificados/criados numa janela curta.
2. **Extensão suspeita conhecida**: `.locked`, `.encrypted`, `.crypt`, etc — lista **não-exaustiva** (ransomware novo inventa extensão nova; não confie só nisso).

Testado com `chokidar` real contra filesystem real (não mockado) — 5 testes, incluindo o cenário exato do surto de modificações em massa e a garantia de que atividade normal não gera falso positivo.

## Analisador de Arquivo (`FileAnalyzer`)

O "clicar direito → Analisar arquivo" de um antivírus comercial — **análise estática apenas** (olha o arquivo parado, nunca o executa; análise dinâmica de verdade exigiria uma sandbox real, que não existe aqui).

```typescript
const result = await shield.analyzeFile("/caminho/suspeito.exe");
console.log(result.entropy); // 0-8 bits/byte, Shannon entropy real
console.log(result.entropyInterpretation); // explicação em texto
console.log(result.extractedStrings); // strings ASCII extraídas, tipo `strings` do Unix
console.log(result.suspiciousIndicators); // ex: "Entropia alta num .exe", "-EncodedCommand do PowerShell"
```

**Entropia alta sozinha NÃO significa malware** — arquivos `.zip`/`.jpg` legítimos também têm entropia alta. É por isso que o indicador de entropia só dispara para extensões executáveis (`.exe`, `.dll`, `.scr`, `.bat`, `.ps1`, `.vbs`), não pra qualquer arquivo. Testado com matemática verificável de verdade: bytes aleatórios reais (`crypto.randomBytes`) batendo entropia > 7.9, e um arquivo de byte único repetido batendo em exatamente 0.0.

## Árvore de Processos

`shield.getProcessTree()` monta a relação pai→filho de todos os processos rodando — o mesmo tipo de visão do Process Explorer/Process Hacker, útil pra investigar "esse processo suspeito foi criado por quem?" (ex: `explorer.exe → powershell.exe → cmd.exe → suspicious.exe`, uma cadeia clássica de ataque). Snapshot sob demanda, não é polling contínuo.

## Quarentena (isolar, não apagar)

Diferente de só detectar e avisar, o `QuarantineManager` move o arquivo pra uma pasta isolada (fora de qualquer pasta sincronizada/monitorada), revoga permissões de execução, e guarda metadados (hash, finding original, timestamp). **Nunca apaga automaticamente** — falsos positivos acontecem mesmo com ClamAV/VirusTotal, e apagar um arquivo legítimo do usuário é pior que deixar algo isolado esperando decisão.

```typescript
const shield = new ShieldCore({
  // ...
  quarantine: { quarantineDir: "/caminho/fora/de/pastas/sincronizadas/quarantine" },
  autoQuarantineCriticalFileThreats: false, // true = quarentena automática em findings críticos com filePath
});

// Sob demanda (ex: botão na UI):
const result = await shield.quarantineFinding(finding);

// Restaurar (verifica hash antes — bloqueia se o arquivo foi adulterado enquanto em quarentena):
await shield.quarantineManager?.restore(entryId);

// Apagar definitivamente (irreversível):
await shield.quarantineManager?.permanentlyDelete(entryId);
```

Testado de ponta a ponta contra filesystem real (não mockado): mover, verificação de integridade na restauração, apagar, e os casos de erro (arquivo já não existe, id inexistente).

## Testes

```bash
npm test        # roda uma vez
npm run test:watch
```

13 testes cobrindo parsing do ClamAV, avaliação de estatísticas da VirusTotal e detecção comportamental do ProcessMonitor — todos com os binários/APIs externos mockados. Mais 8 testes do `QuarantineManager` rodando contra filesystem real (mkdtemp, sem mocks). 21 no total; não dependem de ClamAV/YARA instalados no ambiente de CI.

## Revisão crítica adicional (bug real de produção encontrado e corrigido)

Depois de fechar a v1, voltei com foco em achar problemas reais em vez de só adicionar features. Achados:

- **Bug real no `FirewallManager` (Linux)**: `blockIP()` adiciona a regra na chain `OUTPUT`, mas `removeRule()` só tentava apagar da chain `INPUT`. Na prática, isso significava que **IPs bloqueados via `blockIP` nunca eram desbloqueados de verdade** com `removeRule` — o comando rodava, não dava erro, mas não achava a regra (estava na chain errada) e saía silenciosamente sem remover nada. Corrigido: `removeRuleLinuxByComment` agora faz parsing do `iptables -L -n --line-numbers` rastreando em qual chain (`INPUT`/`FORWARD`/`OUTPUT`) cada regra está, e apaga da chain correta.
- Adicionados testes pro `FirewallManager` (Windows/Linux/macOS) e pro `BinaryVerifier` (contra filesystem real, mesmo padrão do `QuarantineManager`) — nenhum dos dois tinha cobertura antes.
- No processo de escrever os testes do firewall, um segundo bug apareceu — desta vez no próprio teste, não no código: o helper de mock que simula o processo filho (`spawn`) agendava o "fim do processo" no momento em que o teste *declarava* o mock, não no momento em que o código real chamava `spawn()`. Com múltiplas chamadas sequenciais (listar regras, depois apagar), isso fazia o segundo processo simulado "terminar" antes do listener existir, travando o teste. Corrigido trocando para `mockImplementationOnce`, que agenda o fim do processo só quando a chamada real acontece.

Total: 36 testes (13 originais + 8 quarentena + 8 firewall + 7 integridade), todos passando, typecheck limpo.

## Segunda rodada de auditoria (mais um bug real: eventos não repassados)

- **Bug real no `ShieldCore.wireSubmodules()`**: `QuarantineManager`, `FirewallManager` e o evento específico `integrity:violation` do `BinaryVerifier` não estavam na lista de módulos conectados ao sistema de eventos do orquestrador. Na prática: se a quarentena falhasse por qualquer motivo (permissão negada, disco cheio, etc), o erro era emitido internamente mas **nunca chegava no `.on("error", ...)` do app** — silenciosamente descartado. O mesmo valia pra `firewall:rule-changed` e `integrity:violation`. Corrigido: os dois módulos entraram na lista genérica de forwarding, e os dois eventos específicos ganharam forwarding explícito.
- Adicionados 6 testes pro `ShieldCore` (não tinha nenhum teste próprio, só testava os submódulos isoladamente) — cobrindo exatamente esse forwarding, mais `quarantineFinding()` de ponta a ponta através do orquestrador (não só direto no `QuarantineManager`) e o caso de erro claro quando quarentena não está configurada.
- Confirmado com `npm audit`: `shield-core` e `sentinela-agent` estão com **0 vulnerabilidades**. `shield-mobile` tem 10 vulnerabilidades moderadas transitivas (via `expo` → `xcode` → `uuid@7.0.3`, CVE-2026-41907) sem fix disponível upstream ainda — documentado com detalhe no README daquele pacote, incluindo confirmação de que nem a versão nightly mais recente do `xcode` resolve isso.
- Checagem de código morto (`noUnusedLocals`/`noUnusedParameters`) achou e removeu um import não usado (`stat` em `BinaryVerifier.ts`, sobra de uma refatoração).

Total agora: **42 testes**, 0 código morto, typecheck limpo.

## Terceira rodada (config que pareceria funcionar mas geraria comportamento errado silencioso)

- **Risco de arquitetura evitado**: se a pasta de quarentena (`quarantine.quarantineDir`) ficasse dentro de (ou fosse igual a) uma pasta vigiada pelo `FileIntegrityMonitor` (`sentinel.fileIntegrity.watchPaths`), o próprio ato de colocar um arquivo em quarentena — que MOVE o arquivo pra essa pasta — dispararia o monitor de integridade, gerando um alerta falso de "arquivo criado em pasta crítica" sobre a ação de isolar a ameaça. Não dava erro nenhum, só ficava confuso e errado silenciosamente. Agora o `ShieldCore` valida isso no construtor e lança um erro claro e específico se a config tiver esse conflito — falha rápido, no boot, em vez de comportamento estranho descoberto meses depois. 6 testes novos cobrindo aninhamento em ambas direções, igualdade exata, pastas irmãs (não deve barrar), e o caso de nomes parecidos que não são realmente aninhados (`/Startup` vs `/StartupBackup` — não pode confundir prefixo de string com aninhamento de caminho real).
- **Composição `ShieldCore` + `SentinelaAgent` testada de verdade**: o README mostra `shield.on("threat:detected", ...) → sentinela.explainFinding(...)` como exemplo, mas isso nunca tinha rodado de fato — cada pacote só testa a si mesmo isoladamente. Montei um projeto de teste linkando os dois pacotes de verdade (via symlink, simulando workspace) e confirmei que o padrão documentado funciona, incluindo o caso de fallback quando a IA cai no meio do fluxo composto.

Total agora: **48 testes** no `shield-core` (fora os 2 de integração cruzada, que vivem fora do pacote por natureza — são testes de composição entre dois pacotes, não cabem dentro de um só).

## Orquestração do Windows Defender (`DefenderBridge`)

A pergunta que gerou este módulo: "por que não deixar o agente do Orun OS usar o Windows Defender quando precisar, em vez de tentar reconstruir proteção em tempo real do zero?" — resposta certa. O Defender já tem o driver de kernel assinado que o Orun Shield não pode ter sozinho. Em vez de competir, o `DefenderBridge` **orquestra** o Defender via os cmdlets PowerShell oficiais e documentados da própria Microsoft (`Get-MpComputerStatus`, `Get-MpThreatDetection`, `Get-MpThreat`, `Start-MpScan`, `Update-MpSignature`, `Set-MpPreference`) — não é engenharia reversa de nada, é a interface de gerenciamento pública que a Microsoft disponibiliza pra isso.

```typescript
const shield = new ShieldCore({ /* ClamAV, YARA, Sentinela, etc — tudo continua funcionando normalmente */ });

// shield.defender está sempre disponível (mesmo padrão do firewall) —
// internamente ele mesmo checa se está no Windows antes de tentar qualquer coisa.
const status = await shield.getDefenderStatus();
if (!status.available) {
  console.log("Defender não disponível (não é Windows, ou outro AV assumiu o lugar dele)");
}

// Detecções do Defender entram no MESMO feed que ClamAV/YARA/Sentinela alimentam:
shield.on("threat:detected", (finding) => {
  if (finding.source === "windows-defender") {
    // o Sentinela (agente de IA) explica isso do mesmo jeito que explicaria um achado do ClamAV
  }
});
await shield.syncDefenderThreats(); // busca detecções recentes do Defender e injeta no feed

await shield.defender.startQuickScan(); // dispara scan do Defender sob demanda
await shield.defender.updateSignatures(); // atualiza definições do Defender
await shield.defender.ensureRealTimeProtectionEnabled(); // só ATIVA, nunca desativa — requer admin
```

**Isso é o fechamento arquitetural que faltava**: o Orun Shield deixa de tentar ser um antivírus completo sozinho e vira uma camada de orquestração + UX + IA por cima do que o sistema operacional já faz bem — exatamente a recomendação original desde a primeira conversa sobre este projeto ("integração com Windows Defender/macOS XProtect via API do SO, em vez de competir com eles").

**O que foi validado, e o que ainda não:**
- ✅ Parsing testado contra o **formato real e documentado** do `Get-MpThreatDetection`/`Get-MpThreat` — confirmei via pesquisa (não inventei) que o campo `Resources` usa o prefixo `file:_` (não `file:`), e que `SeverityID` vai de 0 a 5 (5 = mais grave, valor 3 raramente aparece em dados reais de produção). 11 testes cobrindo isso, incluindo um exemplo de detecção real publicada (`Trojan:Win32/Wacatac.B!ml`).
- ✅ Platform gating testado: em qualquer SO que não seja Windows, `checkAvailability()`/`getStatus()`/`syncThreats()` retornam imediatamente sem nem tentar chamar `powershell.exe`.
- ✅ Deduplicação testada: sincronizar duas vezes não re-emite o mesmo achado do Defender.
- ⚠️ **Não testado contra PowerShell real** (este ambiente é Linux, sem Windows disponível) — o parsing é validado contra a saída documentada/publicada dos cmdlets, mas não contra uma execução real do `Get-MpThreatDetection` numa máquina Windows de verdade. Isso precisa ser confirmado no seu ambiente antes de considerar essa parte 100% fechada.
- ⚠️ `ensureRealTimeProtectionEnabled()` e `Start-MpScan`/`Update-MpSignature` exigem privilégios de administrador — o módulo não eleva privilégio sozinho, mesmo princípio do `FirewallManager`.

**Total geral do pacote agora: 84 testes.**

## Quarta rodada — módulos novos a partir de pesquisa sobre antivírus profissional

O usuário pesquisou o que um antivírus comercial (nível EDR/XDR — CrowdStrike, SentinelOne) oferece e pediu pra mapear o que dava e o que não dava pra construir sem driver de kernel. Resultado: `RansomwareHeuristicMonitor`, `FileAnalyzer`, e `getProcessTree()` — os itens da lista que eram genuinamente viáveis em user-space. A maioria dos outros itens da lista (proteção em tempo real de verdade, sandbox, anti-keylogger, proteção de memória) **não é viável** sem driver de kernel assinado — documentado com honestidade na resposta ao usuário e nos comentários de cada módulo novo, em vez de fingir cobertura que não existe.

- **`RansomwareHeuristicMonitor`**: 5 testes com `chokidar` real contra filesystem real (não mockado) — taxa de eventos, extensão suspeita, cooldown, ausência de falso positivo em uso normal, start/stop.
- **`FileAnalyzer`**: 10 testes, incluindo validação matemática da entropia de Shannon contra `crypto.randomBytes` real (entropia > 7.9 esperada) e byte único repetido (entropia = 0.0 exata) — não é só "parece certo", é matematicamente verificado.
- **`ProcessMonitor.getProcessTree()`**: 4 testes, incluindo proteção contra auto-referência (processo que aponta pra si mesmo como pai) sem causar loop infinito.
- **Config estendida**: a mesma validação de "quarentena dentro de pasta vigiada" (terceira rodada, acima) foi generalizada pra também cobrir `ransomwareHeuristic.watchPaths` — evita que quarentenar vários arquivos rapidamente dispare um falso alarme de ransomware sobre a própria ação de proteção.
- **TypeScript pegou uma lacuna de integração sozinho**: ao adicionar a nova fonte de detecção `"ransomware-heuristic"` no enum `DetectionSource`, o `Record<ThreatFinding["source"], string>` do componente `ThreatFindingCard` na UI **não compilou** até eu adicionar o label correspondente — é exatamente o tipo de proteção que um `Record` exaustivo (em vez de `Partial`/`any`) garante: impossível esquecer de tratar um caso novo silenciosamente.

Total agora: **73 testes** no `shield-core`.

## CI/CD

`.github/workflows/shield-ci.yml` está pronto pra ser copiado pra raiz do `orun-monorepo` (Actions só lê workflows a partir de `.github/workflows` no root do repo, não dentro de um pacote individual). Roda typecheck + build + testes dos 3 pacotes do Shield (`shield-core`, `sentinela-agent`, `shield-mobile`) a cada push/PR que toque neles, mais `npm audit` nos três — mesmo padrão de CI/CD que vocês já usam nos instaladores cross-platform.

## Persistência entre devices (Supabase)

`supabase/migrations/20260801000000_shield_findings.sql` cria a tabela `shield_findings` com:
- Schema espelhando 1:1 o `ThreatFinding` do `types.ts`
- RLS restrita por `user_id` (dados de processo/rede são sensíveis — mais do que a média das outras tabelas do ecossistema)
- Realtime habilitado (um finding crítico no desktop pode notificar o mobile ao vivo, mesmo padrão do dashboard admin do OrunTV)
- Campo `status` (`open`/`dismissed`/`quarantined`/`restored`/`deleted`) pra rastrear o que o usuário fez com cada achado

Rodar com `supabase db push` ou via CI de migrations, seguindo o fluxo que vocês já têm pros outros schemas.

**Recomendação de volume**: sincronizar só `high`/`critical` por padrão (filtro na camada de sync do app, não na tabela) — findings de `low`/`info` tendem a ser muito mais numerosos e menos acionáveis entre devices.

## Próximos passos sugeridos

1. Integrar ao `orun-monorepo` como novo workspace (`packages/shield-core`) — os outros 3 pacotes (`shield-integration`, `sentinela-agent`, `shield-mobile`) já foram entregues e é só copiar junto
2. Copiar `.github/workflows/shield-ci.yml` pra raiz do monorepo e rodar `supabase db push` na migration
3. GitHub Actions: gerar e assinar o manifesto de integridade (`BinaryVerifier`) a cada release
4. Testar `QuarantineManager`, ClamAV e `freshclam` de ponta a ponta no seu ambiente real (Windows/macOS/Linux, fora das restrições de rede deste sandbox)
5. UI de confirmação antes de ligar `autoQuarantineCriticalFileThreats`/`autoBlockCriticalNetworkThreats` (hoje ambos ficam `false` por padrão de propósito — ação automática e destrutiva merece opt-in explícito do usuário)
