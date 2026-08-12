import { useEffect, useState } from "react";
import { ShieldCheck, Sparkles, Cpu, Settings, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { ShieldScreen } from "./shield/screens/ShieldScreen";
import { OptimizerScreen } from "./optimizer/screens/OptimizerScreen";
import { SettingsScreen } from "./settings/screens/SettingsScreen";
import { Button, Spinner } from "./ui";
import type { AppInfo } from "./bridge";

type View = "shield" | "optimizer" | "settings";

const NAV: { id: View; label: string; hint: string; Icon: typeof ShieldCheck }[] = [
  { id: "shield", label: "Proteção", hint: "Antivírus e defesas", Icon: ShieldCheck },
  { id: "optimizer", label: "Otimizador", hint: "Limpeza e updates", Icon: Sparkles },
  { id: "settings", label: "Configurações", hint: "Sentinela e sobre", Icon: Settings },
];

type UpdateState = {
  phase: "idle" | "checking" | "updating" | "done";
  message: string;
  updated: number;
  failed: number;
};

export default function App() {
  const [view, setView] = useState<View>("shield");
  const [updateState, setUpdateState] = useState<UpdateState>({ phase: "idle", message: "", updated: 0, failed: 0 });
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void window.orunApp.getInfo().then(setAppInfo);
  }, []);

  async function handleQuickUpdate() {
    if (updateState.phase === "checking" || updateState.phase === "updating") return;
    setUpdateState({ phase: "checking", message: "Verificando atualizações...", updated: 0, failed: 0 });
    try {
      const result = await window.orunOptimizer.checkUpdates();
      const outdated = result?.outdated ?? [];
      if (outdated.length === 0) {
        setUpdateState({ phase: "done", message: "Tudo em dia — nenhuma atualização pendente.", updated: 0, failed: 0 });
        return;
      }
      setUpdateState({
        phase: "updating",
        message: `Atualizando ${outdated.length} pacote(s)...`,
        updated: 0,
        failed: 0,
      });
      const results = await window.orunOptimizer.runUpdatesBatch(outdated.map((p) => p.id));
      const okCount = results.filter((r) => r.success).length;
      const failCount = results.length - okCount;
      setUpdateState({
        phase: "done",
        message:
          failCount === 0
            ? `${okCount} pacote(s) atualizado(s).`
            : `${okCount} atualizado(s), ${failCount} falhou(ram).`,
        updated: okCount,
        failed: failCount,
      });
    } catch (err) {
      setUpdateState({ phase: "done", message: `Falha ao verificar atualizações: ${String(err)}`, updated: 0, failed: 0 });
    }
  }

  const updating = updateState.phase === "checking" || updateState.phase === "updating";

  return (
    <div className="flex h-full bg-bg text-ink">
      {/* ---------- Sidebar ---------- */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-bg-2/80">
        <div className="flex items-center gap-3 border-b border-line px-4 py-4">
          <img
            src="logo.png"
            alt="Orun Shield"
            className="h-10 w-10 rounded-[10px] object-cover ring-1 ring-line-2"
            draggable={false}
          />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold leading-tight tracking-tight text-ink">Orun Shield</p>
            <p className="truncate text-[11px] leading-tight text-ink-3">Segurança e Otimização</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 p-2">
          {NAV.map(({ id, label, hint, Icon }) => {
            const active = view === id;
            return (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 ${
                  active ? "bg-panel-2 text-ink" : "text-ink-3 hover:bg-panel-2/60 hover:text-ink-2"
                }`}
              >
                {active && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent" />}
                <Icon className={`h-4 w-4 shrink-0 ${active ? "text-accent" : "text-ink-3"}`} />
                <span className="min-w-0">
                  <span className={`block text-sm leading-tight ${active ? "font-medium" : "font-normal"}`}>{label}</span>
                  <span className="block truncate text-[11px] leading-tight text-ink-3">{hint}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-2 border-t border-line p-3">
          <Button variant="secondary" onClick={() => void handleQuickUpdate()} disabled={updating} className="w-full">
            {updating ? <Spinner /> : <RefreshCw className="h-4 w-4 text-accent" />}
            <span className="min-w-0 flex-1 truncate text-left">
              {updateState.phase === "checking"
                ? "Verificando..."
                : updateState.phase === "updating"
                  ? "Atualizando..."
                  : "Atualizar apps"}
            </span>
          </Button>
          {updateState.phase === "done" && (
            <p
              className={`flex items-start gap-1.5 text-[11px] leading-snug ${
                updateState.failed > 0 ? "text-amber-400" : "text-emerald-400"
              }`}
            >
              {updateState.failed > 0 ? (
                <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
              )}
              <span>{updateState.message}</span>
            </p>
          )}
          <div className="flex items-center gap-2 px-1 text-[11px] text-ink-3">
            <Cpu className="h-3.5 w-3.5" />
            Motores locais · v{appInfo?.version ?? "0.2.0"}
          </div>
        </div>
      </aside>

      {/* ---------- Conteúdo ---------- */}
      <main className="min-w-0 flex-1 overflow-hidden">
        {view === "shield" ? (
          <ShieldScreen />
        ) : view === "optimizer" ? (
          <OptimizerScreen />
        ) : (
          <SettingsScreen />
        )}
      </main>
    </div>
  );
}
