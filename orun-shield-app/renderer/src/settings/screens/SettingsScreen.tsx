import { useEffect, useState } from "react";
import { Settings, BrainCircuit, Cpu, Globe, KeyRound, Loader2, Save, PlugZap, CheckCircle2, XCircle, Info } from "lucide-react";
import { useAiStore } from "../../ai/store/useAiStore";
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
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400">
          <Settings className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Configurações</h1>
          <p className="text-sm text-zinc-500">Sentinela (IA) e informações do app</p>
        </div>
      </div>

      {/* -------- Sentinela (IA) -------- */}
      <section className="rounded-2xl border border-zinc-800">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <span className="flex items-center gap-2 text-sm text-zinc-300">
            <BrainCircuit className="h-4 w-4 text-blue-400" />
            Sentinela (IA)
          </span>
          {status && (
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                status.ready
                  ? "border-emerald-800 bg-emerald-950/40 text-emerald-400"
                  : "border-zinc-700 bg-zinc-800/40 text-zinc-500"
              }`}
            >
              {status.configuredProvider} {status.ready ? "pronto" : status.ollamaAvailable ? "conectando" : "fallback"}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-4 p-4">
          <p className="text-xs leading-relaxed text-zinc-500">
            O Sentinela explica alertas de segurança em linguagem clara. Ele tenta usar o provider abaixo; se não
            responder, cai num fallback determinístico — a segurança nunca fica sem resposta.
          </p>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-zinc-400">Provider</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {PROVIDER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update("provider", opt.value)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    form?.provider === opt.value
                      ? "border-blue-800 bg-blue-950/30"
                      : "border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900"
                  }`}
                >
                  <span className={`block text-sm font-medium ${form?.provider === opt.value ? "text-blue-300" : "text-zinc-200"}`}>
                    {opt.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-zinc-500">{opt.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Modelo">
              <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                <Cpu className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                <input
                  value={form?.model ?? ""}
                  onChange={(e) => update("model", e.target.value)}
                  placeholder={providerMeta.modelPlaceholder}
                  className="w-full bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                />
              </div>
            </Field>

            <Field label="URL base">
              <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                <Globe className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                <input
                  value={form?.baseUrl ?? ""}
                  onChange={(e) => update("baseUrl", e.target.value)}
                  placeholder={providerMeta.urlPlaceholder}
                  className="w-full bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                />
              </div>
            </Field>

            {form?.provider !== "ollama" && (
              <Field label="API key">
                <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                  <KeyRound className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                  <input
                    type={showKey ? "text" : "password"}
                    value={form?.apiKey ?? ""}
                    onChange={(e) => update("apiKey", e.target.value)}
                    placeholder="sk-..."
                    autoComplete="off"
                    className="w-full bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                  />
                  <button onClick={() => setShowKey((s) => !s)} className="text-[11px] text-zinc-500 hover:text-zinc-300">
                    {showKey ? "ocultar" : "mostrar"}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-zinc-600">Fica salva localmente no app (nunca sai da sua máquina).</p>
              </Field>
            )}
          </div>

          {connectionTest && (
            <div
              className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                testOk ? "border-emerald-900/50 bg-emerald-950/20 text-emerald-300" : "border-red-900/50 bg-red-950/20 text-red-300"
              }`}
            >
              {testOk ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              <span className="leading-relaxed">{connectionTest.message}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void handleSave()}
              disabled={!form || isSavingConfig}
              className="flex items-center gap-2 rounded-lg bg-blue-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSavingConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSavingConfig ? "Salvando..." : "Salvar configuração"}
            </button>
            <button
              onClick={() => void testConnection()}
              disabled={isTestingConnection || !form}
              className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isTestingConnection ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              {isTestingConnection ? "Testando..." : "Testar conexão"}
            </button>
            {savedFlash && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Configuração salva
              </span>
            )}
          </div>
        </div>
      </section>

      {/* -------- Sobre o app -------- */}
      <section className="rounded-2xl border border-zinc-800">
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
          <Info className="h-4 w-4 text-zinc-400" />
          <span className="text-sm text-zinc-300">Sobre o app</span>
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-b-2xl bg-zinc-800/60 sm:grid-cols-3">
          <AboutCell label="Produto" value={appInfo?.name ?? "Orun Shield"} />
          <AboutCell label="Versão" value={appInfo?.version ?? "—"} />
          <AboutCell label="Plataforma" value={appInfo ? `${appInfo.platform} ${appInfo.arch}` : "—"} />
          <AboutCell label="Electron" value={appInfo?.electron ?? "—"} />
          <AboutCell label="Node" value={appInfo?.node ?? "—"} />
          <AboutCell label="Idioma da IA" value="pt-BR" />
        </div>
        <p className="px-4 py-3 text-[11px] leading-relaxed text-zinc-600">
          Motores de segurança e otimização rodam 100% locais. A única chamada externa é opcional (provider de IA
          configurado acima) e a desinstalação/atualização de apps usa o winget da Microsoft.
        </p>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-zinc-400">{label}</label>
      {children}
    </div>
  );
}

function AboutCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-950 p-3">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className="mt-0.5 truncate text-sm text-zinc-200">{value}</p>
    </div>
  );
}
