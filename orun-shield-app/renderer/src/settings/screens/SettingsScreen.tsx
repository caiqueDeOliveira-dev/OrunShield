import { useEffect, useState } from "react";
import { BrainCircuit, Cpu, Globe, KeyRound, PlugZap, CheckCircle2, XCircle, Info, ShieldCheck } from "lucide-react";
import { useAiStore } from "../../ai/store/useAiStore";
import { Button, Panel, PanelHeader, Spinner, StatusPill } from "../../ui";
import type { AiConfig, AppInfo, AiProviderKind } from "../../bridge";

const PROVIDER_OPTIONS: { value: AiProviderKind; label: string; hint: string; modelPlaceholder: string; urlPlaceholder: string }[] = [
  {
    value: "ollama",
    label: "Ollama (local)",
    hint: "IA gratuita rodando na sua máquina — recomendado para privacidade.",
    modelPlaceholder: "llama3.2",
    urlPlaceholder: "http://localhost:11434",
  },
  {
    value: "openai-compatible",
    label: "OpenAI / OpenRouter / Groq",
    hint: "Qualquer API compatível com /v1/chat/completions.",
    modelPlaceholder: "gpt-4o-mini",
    urlPlaceholder: "https://api.openai.com/v1",
  },
  {
    value: "anthropic",
    label: "Anthropic (Claude)",
    hint: "API oficial da Anthropic.",
    modelPlaceholder: "claude-3-5-sonnet-latest",
    urlPlaceholder: "https://api.anthropic.com",
  },
];

export function SettingsScreen() {
  const {
    config,
    status,
    connectionTest,
    isTestingConnection,
    isSavingConfig,
    hydrate,
    saveConfig,
    testConnection,
  } = useAiStore();

  const [form, setForm] = useState<AiConfig | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    void hydrate();
    void window.orunApp.getInfo().then(setAppInfo);
  }, [hydrate]);

  useEffect(() => {
    if (config && !form) setForm({ ...config });
  }, [config, form]);

  const providerMeta = PROVIDER_OPTIONS.find((p) => p.value === form?.provider) ?? PROVIDER_OPTIONS[0];

  function update<K extends keyof AiConfig>(key: K, value: AiConfig[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function handleSave() {
    if (!form) return;
    await saveConfig(form);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2500);
  }

  const testOk = connectionTest?.ok;

  return (
    <div className="scroll-area h-full overflow-y-auto">
      <div className="flex flex-col gap-5 p-6">
        {/* ---------- Cabeçalho ---------- */}
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent ring-1 ring-accent/25">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight tracking-tight text-ink">Configurações</h1>
            <p className="text-sm text-ink-2">Sentinela (IA) e informações do app</p>
          </div>
        </div>

        {/* ---------- Sentinela (IA) ---------- */}
        <Panel flush>
          <PanelHeader
            icon={<BrainCircuit className="h-4 w-4 text-accent" />}
            title="Sentinela (IA)"
            hint="Explica alertas em linguagem clara, com fallback determinístico"
            right={
              status && (
                <StatusPill
                  label={`${status.configuredProvider} ${status.ready ? "pronto" : status.ollamaAvailable ? "conectando" : "fallback"}`}
                  tone={status.ready ? "ok" : "off"}
                />
              )
            }
          />

          <div className="flex flex-col gap-5 p-5">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-ink-2">Provider</label>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {PROVIDER_OPTIONS.map((opt) => {
                  const active = form?.provider === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => update("provider", opt.value)}
                      className={`rounded-xl border p-3.5 text-left transition-colors duration-150 ${
                        active
                          ? "border-accent/40 bg-accent/5 ring-1 ring-accent/20"
                          : "border-line bg-panel hover:border-line-2 hover:bg-panel-2/60"
                      }`}
                    >
                      <span className={`block text-sm font-medium ${active ? "text-accent-2" : "text-ink"}`}>
                        {opt.label}
                      </span>
                      <span className="mt-1 block text-[11px] leading-snug text-ink-3">{opt.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Modelo">
                <div className="flex items-center gap-2.5 rounded-lg border border-line bg-sunken px-3 py-2 transition-colors focus-within:border-line-2">
                  <Cpu className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                  <input
                    value={form?.model ?? ""}
                    onChange={(e) => update("model", e.target.value)}
                    placeholder={providerMeta.modelPlaceholder}
                    className="w-full bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none"
                  />
                </div>
              </Field>

              <Field label="URL base">
                <div className="flex items-center gap-2.5 rounded-lg border border-line bg-sunken px-3 py-2 transition-colors focus-within:border-line-2">
                  <Globe className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                  <input
                    value={form?.baseUrl ?? ""}
                    onChange={(e) => update("baseUrl", e.target.value)}
                    placeholder={providerMeta.urlPlaceholder}
                    className="w-full bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none"
                  />
                </div>
              </Field>

              {form?.provider !== "ollama" && (
                <Field label="API key">
                  <div className="flex items-center gap-2.5 rounded-lg border border-line bg-sunken px-3 py-2 transition-colors focus-within:border-line-2">
                    <KeyRound className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                    <input
                      type={showKey ? "text" : "password"}
                      value={form?.apiKey ?? ""}
                      onChange={(e) => update("apiKey", e.target.value)}
                      placeholder="sk-..."
                      autoComplete="off"
                      className="w-full bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none"
                    />
                    <button onClick={() => setShowKey((s) => !s)} className="text-[11px] text-ink-3 transition-colors hover:text-ink-2">
                      {showKey ? "ocultar" : "mostrar"}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-ink-3">Fica salva localmente no app (nunca sai da sua máquina).</p>
                </Field>
              )}
            </div>

            {connectionTest && (
              <div
                className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-sm ${
                  testOk
                    ? "border-emerald-400/25 bg-emerald-400/5 text-emerald-300"
                    : "border-accent/25 bg-accent/5 text-accent-2"
                }`}
              >
                {testOk ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                <span className="leading-relaxed">{connectionTest.message}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                variant="primary"
                icon={isSavingConfig ? <Spinner /> : <ShieldCheck className="h-4 w-4" />}
                onClick={() => void handleSave()}
                disabled={!form || isSavingConfig}
              >
                {isSavingConfig ? "Salvando..." : "Salvar configuração"}
              </Button>
              <Button
                icon={isTestingConnection ? <Spinner /> : <PlugZap className="h-4 w-4" />}
                onClick={() => void testConnection()}
                disabled={isTestingConnection || !form}
              >
                {isTestingConnection ? "Testando..." : "Testar conexão"}
              </Button>
              {savedFlash && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Configuração salva
                </span>
              )}
            </div>
          </div>
        </Panel>

        {/* ---------- Sobre o app ---------- */}
        <Panel flush>
          <PanelHeader
            icon={<Info className="h-4 w-4 text-ink-2" />}
            title="Sobre o app"
            hint="Versão e ambiente de execução"
          />
          <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3">
            <AboutCell label="Produto" value={appInfo?.name ?? "Orun Shield"} />
            <AboutCell label="Versão" value={appInfo?.version ?? "—"} />
            <AboutCell label="Plataforma" value={appInfo ? `${appInfo.platform} ${appInfo.arch}` : "—"} />
            <AboutCell label="Electron" value={appInfo?.electron ?? "—"} />
            <AboutCell label="Node" value={appInfo?.node ?? "—"} />
            <AboutCell label="Idioma da IA" value="pt-BR" />
          </div>
          <p className="px-5 py-4 text-[11px] leading-relaxed text-ink-3">
            Motores de segurança e otimização rodam 100% locais. A única chamada externa é opcional (provider de IA
            configurado acima) e a desinstalação/atualização de apps usa o winget da Microsoft.
          </p>
        </Panel>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-ink-2">{label}</label>
      {children}
    </div>
  );
}

function AboutCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-sunken px-4 py-3">
      <p className="text-[11px] text-ink-3">{label}</p>
      <p className="mt-0.5 truncate text-sm text-ink-2">{value}</p>
    </div>
  );
}
