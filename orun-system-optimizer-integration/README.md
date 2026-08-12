# Integração do Optimizer no monorepo

Mesmo padrão do `orun-shield-integration/` — arquivos de "cola" entre `@orun/system-optimizer` (lógica pura) e o app Electron/React.

## Onde cada arquivo entra no `orun-monorepo`

| Arquivo aqui | Destino sugerido |
|---|---|
| `electron/optimizerChannels.ts` | `apps/desktop/electron/optimizerChannels.ts` |
| `electron/optimizerMain.ts` | `apps/desktop/electron/optimizerMain.ts` — chamar `initializeOptimizer()` junto de `initializeShield(mainWindow)` no `main.ts` |
| `electron/preload.ts` | Mesclar no `preload.ts` principal (mais um `contextBridge.exposeInMainWorld`, junto de `orunShield`, `orunAI`, `orunSync`) |
| `renderer/store/useOptimizerStore.ts` | `packages/design-system/src/stores/` |
| `renderer/screens/OptimizerScreen.tsx` | `packages/design-system/src/screens/` — nova rota `/optimizer` no router |
| `renderer/components/*.tsx` | `packages/design-system/src/components/optimizer/` |

## Passos de integração

1. Copiar `orun-system-optimizer` pra `packages/system-optimizer` no monorepo, adicionar ao workspace raiz.
2. `apps/desktop/package.json` → `"@orun/system-optimizer": "workspace:*"`.
3. `main.ts`: `initializeOptimizer(shieldQuarantineDirName?)` dentro do `app.whenReady()`. Se o app também usa `@orun/shield-core`, passe o nome da pasta de quarentena do Shield (ex: `"shield-quarantine"`) — assim o Optimizer nunca escaneia/classifica arquivos que o Shield já isolou como se fossem lixo comum. Não precisa de `mainWindow` como parâmetro (diferente do Shield) já que o Optimizer não empurra eventos contínuos pro renderer — tudo aqui é request/response sob demanda.
4. Rota: `<Route path="/optimizer" element={<OptimizerScreen />} />` + item de menu com ícone `HardDrive` ou `Sparkles`.
5. **Elevação de privilégios**: `apt-get install --only-upgrade` (Linux) e alguns updates do `winget` precisam de root/admin. Isso NÃO está resolvido nesta integração — o app precisa implementar sua própria estratégia de elevação (ex: `sudo-prompt` no Node, ou pedir UAC no Windows) antes de chamar `runUpdate`/`runUpdatesBatch`.

## Nota de segurança na tela de disco

A aba "Uso de disco" permite excluir qualquer item direto da árvore (sem passar pela classificação do `JunkFileDetector`). Isso é mais arriscado que a aba "Limpeza" — recomendo fortemente adicionar um diálogo de confirmação explícito ali antes de ligar em produção (comentário já deixado no código-fonte do `OptimizerScreen.tsx` no ponto exato onde isso deveria entrar).
