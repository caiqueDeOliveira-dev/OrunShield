# Integração do Orun Shield no monorepo

Este pacote não é standalone — são os arquivos de "cola" entre `@orun/shield-core` (lógica pura) e o app Electron/React que já existe.

## Onde cada arquivo entra no `orun-monorepo`

| Arquivo aqui | Destino sugerido |
|---|---|
| `electron/shieldChannels.ts` | `apps/desktop/electron/shieldChannels.ts` (importado por main e preload) |
| `electron/shieldMain.ts` | `apps/desktop/electron/shieldMain.ts` — chamar `initializeShield(mainWindow)` dentro do `app.whenReady()` do `main.ts` existente, depois que `mainWindow` for criada |
| `electron/preload.ts` | Mesclar dentro do `preload.ts` principal do Orun OS (o `contextBridge.exposeInMainWorld("orunShield", ...)` pode conviver com as outras pontes: `orunAI`, `orunSync`) |
| `renderer/store/useShieldStore.ts` | `packages/design-system/src/stores/useShieldStore.ts` (ou onde ficam as outras stores Zustand hoje) |
| `renderer/screens/ShieldScreen.tsx` | `packages/design-system/src/screens/ShieldScreen.tsx` — adicionar ao roteador (HashRouter) junto das outras 20 telas desktop |
| `renderer/components/*.tsx` | `packages/design-system/src/components/shield/` |

## Passos de integração

1. **Adicionar o workspace**: copiar `orun-shield-core` para `packages/shield-core` no monorepo e adicionar ao `package.json` raiz (`workspaces`).
2. **Dependência no app desktop**: `apps/desktop/package.json` → `"@orun/shield-core": "workspace:*"`.
3. **main.ts**: dentro de `app.whenReady().then(() => { ... createWindow(); initializeShield(mainWindow); })`. Chamar `shutdownShield()` no handler de `before-quit`.
4. **preload.ts**: mesclar o `contextBridge.exposeInMainWorld` deste arquivo com o preload existente (não pode haver duas chamadas de `exposeInMainWorld` para o mesmo namespace).
5. **Rota**: adicionar `<Route path="/shield" element={<ShieldScreen />} />` no router e um item de menu com o ícone `ShieldCheck` (lucide-react) na navegação lateral.
6. **Variável de ambiente**: `ORUN_VT_API_KEY` no `.env` do app desktop (nunca no client-side/renderer — fica só no main process, mesmo princípio já usado para o `service_role` do Supabase).
7. **Rules do YARA**: copiar a pasta `rules/` do `shield-core` para dentro do bundle do Electron (`extraResources` no `electron-builder.yml`) para que `app.getAppPath()` encontre em produção.

## Nota sobre o tema Blood Red

Os componentes (`ThreatFindingCard`, `SeverityBadge`, `ShieldScreen`) usam classes Tailwind diretas (`zinc-*`, `red-*`) como baseline funcional. Para os 4 temas trocáveis (Blood Red, Dark, Premium, Minimal) do design system, o ideal é trocar essas classes pelas CSS variables/tokens que os outros componentes já usam (ex: `var(--color-surface)`, `var(--color-danger)`) — isso eu não tenho visibilidade de quais são exatamente os tokens atuais do `@orun/design-system`, então ajustei com cores "seguras" para você trocar pelos tokens reais rapidamente.

## Persistência entre devices (Supabase)

O `ThreatFinding` já é serializável (schema Zod em `types.ts` do shield-core). Para sincronizar entre desktop e mobile via `@orun/supabase-sync`, sugiro uma tabela `shield_findings` com os mesmos campos do schema, seguindo o mesmo padrão outbox/FK-ordered push que vocês já usam nas outras entidades. Findings de rede/processo (dados sensíveis do dispositivo) — vale considerar RLS restrita por `user_id` e talvez nem sincronizar tudo, só os `critical`/`high`, para não estourar volume de sync.
