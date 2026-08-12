# @orun/sentinela-agent

Agente do Hampton que traduz os `ThreatFinding` técnicos do `@orun/shield-core` em explicações naturais para o usuário. Faz parte da lista de "16 de 18 agentes com persona mas sem lógica especializada ainda" — este é um deles ganhando lógica de verdade.

## Providers suportados

| Provider | Uso |
|---|---|
| `ollama` | Local, sem custo, sem dados saindo da máquina — recomendado como padrão, já que findings de segurança podem conter caminhos de arquivo e IPs internos |
| `anthropic` | Cloud, via API da Anthropic |
| `openai-compatible` | Cobre OpenAI, OpenRouter, Groq e GitHub Models com o mesmo adaptador (todos falam o formato `/chat/completions`) |

## Princípio central: nunca ficar sem explicação

Se o provider de IA falhar (Ollama caiu, API key inválida, sem rede), o agente **nunca lança exceção pro chamador** — cai automaticamente num fallback determinístico baseado em templates por severidade. Segurança não pode virar uma tela em branco só porque a IA está fora do ar. Isso foi validado de ponta a ponta neste ambiente (sem Ollama instalado, o `explainFinding` caiu no fallback corretamente, ver `isFallback: true` na resposta).

## Uso

```typescript
import { SentinelaAgent } from "@orun/sentinela-agent";
import { ShieldCore } from "@orun/shield-core";

const sentinela = new SentinelaAgent({
  provider: { kind: "ollama", model: "llama3", baseUrl: "http://localhost:11434" },
  // Fallback de config sugerido: se o Ollama não estiver disponível, trocar para cloud
  // dinamicamente é responsabilidade do app (checar OllamaProvider.checkAvailability() no boot).
});

const shield = new ShieldCore({ /* ... */ });

shield.on("threat:detected", async (finding) => {
  const explanation = await sentinela.explainFinding(finding);
  // Enviar `explanation.explanation` pro renderer via IPC, junto do finding técnico original.
  // `explanation.isFallback` permite a UI mostrar um indicador sutil tipo "explicação automática"
  // quando não veio de IA de verdade.
});
```

## Integração com o dashboard (Electron)

No `shieldMain.ts` (ver pacote `orun-shield-integration`), adicionar:

```typescript
shield.on("threat:detected", async (finding) => {
  mainWindow.webContents.send(ShieldIpcChannel.THREAT_DETECTED, finding);
  const explanation = await sentinela.explainFinding(finding);
  mainWindow.webContents.send(ShieldIpcChannel.THREAT_EXPLAINED, explanation); // novo canal a adicionar
});
```

No `ThreatFindingCard.tsx`, mostrar `explanation.explanation` como texto principal (linguagem natural) e deixar a descrição técnica original (`finding.description`) num "ver detalhes técnicos" expansível — mantém a tela acessível pra quem não é técnico sem esconder informação de quem é.

## Testes

6 testes cobrindo: resposta normal da IA, fallback em falha do provider, garantia de que nunca lança exceção, cache, e resumo em lote (com e sem IA disponível).

```bash
npm test
```

## Nota sobre custo/latência

`explainFinding` é chamado por finding individual — em picos de alertas (ex: scan completo achando 50 arquivos), isso significa até 50 chamadas de IA. Para esse cenário, prefira `summarizeBatch()` (1 chamada só, resumo executivo) e deixe `explainFinding` só para quando o usuário abre o card de um alerta específico (lazy, sob demanda) — é assim que o `ShieldScreen.tsx` já está estruturado hoje: os findings mockados de sync/rede podem chamar `summarizeBatch`, e os cards individuais podem chamar `explainFinding` só ao expandir.
