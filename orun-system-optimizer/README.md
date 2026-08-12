# @orun/system-optimizer

Análise de uso de disco, limpeza segura de arquivos desnecessários, e verificação/atualização de software desatualizado para o Orun OS. Mesmo princípio de segurança usado no `@orun/shield-core`: **nunca apagar nada direto** — sempre classificar, mostrar pro usuário, e mover pra uma área de espera antes de qualquer exclusão permanente.

## Módulos

### `DiskUsageScanner`
Percorre uma árvore de diretórios e calcula o tamanho de cada arquivo/pasta, retornando tanto a árvore completa quanto uma lista achatada dos maiores consumidores (`topconsumers`) — útil pra UI mostrar de cara "onde está o espaço" sem precisar navegar pasta por pasta.

```typescript
const scanner = new DiskUsageScanner({ topN: 20 });
const result = await scanner.scan("/home/usuario");
console.log(result.topconsumers); // maiores arquivos/pastas, já ordenados
```

Resiliente a erros de permissão: uma pasta protegida não aborta o scan inteiro, só é reportada em `result.errors`.

### `JunkFileDetector`
Identifica candidatos a limpeza — **classifica e explica o motivo, nunca apaga sozinho**. Categorias: arquivo temporário, cache, log, instalador antigo em Downloads, pasta vazia, metadado do SO (Thumbs.db, .DS_Store).

```typescript
const detector = new JunkFileDetector({ oldDownloadsThresholdDays: 90 });
const result = await detector.scan(downloadsPath, /* isDownloadsFolder */ true);
console.log(result.totalReclaimableBytes); // quanto espaço isso liberaria, se o usuário confirmar
```

### `CleanupManager`
Move os candidatos escolhidos (pelo `JunkFileDetector` ou selecionados manualmente na tela de uso de disco) pra uma **área de espera** — mesma filosofia do `QuarantineManager` do Shield. Nada é apagado de vez sem essa segunda chance.

```typescript
const cleanup = new CleanupManager({ holdingDir: "/caminho/fora/de/pastas/importantes", holdingPeriodDays: 7 });

await cleanup.moveManyToHolding(candidatosSelecionados); // move, não apaga
await cleanup.restore(id); // usuário mudou de ideia
await cleanup.permanentlyDelete(id); // usuário confirmou de vez — irreversível
await cleanup.purgeEligible(); // opcional: purga automática do que passou do prazo — só roda se você chamar explicitamente (ex: num cron diário do app)
```

**Importante**: `purgeEligible()` nunca é chamado automaticamente pelo pacote. Se você quiser uma limpeza automática do que passou do prazo de espera, precisa agendar isso explicitamente no seu app — isso é intencional, pra que apagar de verdade seja sempre uma decisão consciente de quem integra o pacote.

### `UpdateChecker` / `UpdateExecutor`
Verifica e aplica atualizações via o gerenciador de pacotes nativo do SO — não reimplementa nada, orquestra ferramentas já maduras (mesmo princípio do ClamAV no Shield):

| SO | Ferramenta | Formato de saída usado |
|---|---|---|
| Windows | `winget` | Tabela de texto (parsing por colunas — ver limitação abaixo) |
| macOS | `brew` | `--json=v2`, estruturado e confiável |
| Linux | `apt` | `list --upgradable`, parsing por regex |

```typescript
const checker = new UpdateChecker();
const available = await checker.checkAvailable("apt"); // detecta se o binário existe antes de tentar usar
const result = await checker.checkApt(); // ou checkBrew() / checkWinget()

const executor = new UpdateExecutor();
await executor.update("apt", "curl"); // atualiza um pacote específico
await executor.updateMany("apt", ["curl", "dpkg"]); // vários de uma vez, falhas individuais não travam o lote
```

**Limitações reais, documentadas em vez de escondidas:**
- **Nem todo software instalado passa por esses gerenciadores.** Apps instalados manualmente (baixados de um site e instalados sem `winget`/`brew`/`apt`), Microsoft Store, ou builds portáteis não aparecem aqui. Isso é uma limitação de abordagem, não um bug — não existe forma universal de detectar "todo software desatualizado" sem depender de algum gerenciador de pacotes.
- **Parsing do `winget` é frágil.** Diferente do `brew` (JSON estruturado) e do `apt` (formato estável há décadas), o `winget` não tem uma saída máquina-amigável universal em todas as versões — o parser divide colunas por 2+ espaços, o que pode quebrar se a Microsoft mudar o formato da tabela ou se o Windows estiver em outro idioma (cabeçalhos localizados). Testado com a saída em inglês; **não testado em Windows localizado em português** — se for usar assim, vale validar o cabeçalho `Nome  Id  Versão  Disponível` (ou equivalente) antes de confiar no parsing.
- **Atualizações exigem privilégio elevado** na maioria dos casos (`apt-get install` no Linux precisa de root, `winget upgrade` de alguns pacotes pede UAC). O `UpdateExecutor` não eleva privilégios sozinho — o app precisa solicitar isso antes de chamar `update()`.
- **`--only-upgrade` no apt é proposital**: garante que o comando nunca instala um pacote novo por engano, só atualiza um já instalado.

### `SystemOptimizer` (orquestrador — ponto de entrada recomendado)

Une todos os módulos acima, com uma garantia de segurança que **não pode depender de quem integra lembrar de configurar direito**: o nome da própria pasta de espera do `CleanupManager` é automaticamente excluído dos scans de disco e de junk.

```typescript
import { SystemOptimizer } from "@orun/system-optimizer";

const optimizer = new SystemOptimizer({
  cleanup: { holdingDir: "/caminho/para/optimizer-holding", holdingPeriodDays: 7 },
  extraExcludeDirNames: ["shield-quarantine"], // se o Shield também estiver no mesmo app
});

await optimizer.scanDisk("/home/usuario");
await optimizer.scanJunk("/home/usuario/Downloads", true);
await optimizer.cleanupCandidates(candidatosSelecionados);
await optimizer.checkUpdates(); // detecta winget/brew/apt automaticamente
```

**Risco de arquitetura evitado (mesma classe de bug que apareceu no Shield):** `userData` do Electron fica **dentro da home do usuário no Linux** (`~/.config/<app>`). Se a pasta de espera do Optimizer ficar lá (cenário comum e razoável) e o usuário rodar um scan de disco/limpeza na própria home, sem essa proteção o scan contaria a própria área de espera como "consumidora de espaço", ou pior, tentaria reclassificar arquivos que o próprio usuário já tinha decidido descartar como se fossem candidatos novos — confuso e redundante, mesmo que não seja perigoso de fato (nada seria apagado por engano, só a experiência ficaria estranha). Testado com um cenário real reproduzindo exatamente essa condição (pasta de espera nascida dentro da árvore escaneada) — 5 testes cobrindo o `SystemOptimizer`, incluindo o caso de conviver com a pasta de quarentena do `@orun/shield-core` via `extraExcludeDirNames`.

## Validação real feita neste ambiente

40 testes passando, incluindo:
- `DiskUsageScanner`: 5 testes contra filesystem real (mkdtemp), incluindo um caso de link simbólico quebrado gerando erro real (ENOENT) sem abortar o scan — **nota**: o teste original tentava simular "pasta sem permissão" via `chmod 000`, mas isso não funciona quando o processo roda como root (comum em CI/Docker, e neste próprio ambiente de desenvolvimento) — corrigido pra usar um link quebrado, que gera erro real independente de privilégio.
- `JunkFileDetector`: 10 testes, incluindo o caso de não confundir `relatorio.temporario.docx` com um arquivo `.tmp` de verdade.
- `CleanupManager`: 9 testes contra filesystem real, incluindo `purgeEligible()` com relógio mockado (`vi.useFakeTimers`) pra testar a passagem do prazo de espera sem esperar dias de verdade.
- `UpdateChecker`: 8 testes com dados sintéticos (apt/brew/winget) + **3 testes de integração real rodando o `apt` de verdade instalado neste ambiente**, confirmando que o parser processa uma saída genuína do sistema operacional, não só exemplos inventados.
- `SystemOptimizer`: 5 testes confirmando a proteção automática contra a própria pasta de espera (ver seção acima).

## Integração (Electron + React)

Pacote irmão `orun-system-optimizer-integration/` traz `optimizerMain.ts`, `preload.ts`, store Zustand, e `OptimizerScreen.tsx` com três abas (Uso de disco / Limpeza / Atualizações) — mesmo padrão de composição do `orun-shield-integration/`. Ver README daquele pacote pra instruções de onde cada arquivo entra no monorepo.

## Próximos passos sugeridos

1. Testar o parsing do `winget` contra uma saída real do Windows (este ambiente não tem winget disponível pra testar de verdade — só `apt` foi validado com o binário real)
2. Diálogo de confirmação explícito na UI antes de mover algo pra área de espera direto da tela de uso de disco (a aba de Limpeza já tem esse fluxo mais seguro por natureza — a de disco é mais "livre" e arriscada)
3. Rotina de `purgeEligible()` agendada (ex: 1x por dia) se o produto quiser limpeza automática do que passou do prazo — hoje é 100% manual por decisão de design
