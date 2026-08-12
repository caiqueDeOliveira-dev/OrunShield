import { useEffect, useState } from "react";
import { ShieldCheck, Sparkles, Cpu, Settings, RefreshCw, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { ShieldScreen } from "./shield/screens/ShieldScreen";
import { OptimizerScreen } from "./optimizer/screens/OptimizerScreen";
import { SettingsScreen } from "./settings/screens/SettingsScreen";
import type { AppInfo } from "./bridge";

type View = "shield" | "optimizer" | "settings";

const NAV: { id: View; label: string; hint: string; Icon: typeof ShieldCheck }[] = [
  { id: "shield", label: "Shield", hint: "Antivírus", Icon: ShieldCheck },
  { id: "optimizer", label: "Otimizador", hint: "Limpeza e updates", Icon: Sparkles },
  { id: "settings", label: "Configurações", hint: "IA e sobre", Icon: Settings },
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

  return (
    <div className="flex h-full bg-zinc-950 text-zinc-100">
      <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-900/40 backdrop-blur">
        <div className="flex items-center gap-3 border-b border-zinc-800/80 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-950 text-red-500">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-100">Orun Shield</p>
            <p className="truncate text-[11px] text-zinc-500">Antivírus + Otimizador</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 p-2">
          {NAV.map(({ id, label, hint, Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                view === id ? "bg-zinc-800/80 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
              }`}
            >
              <Icon className={`h-4 w-4 ${view === id ? "text-red-400" : "text-zinc-500"}`} />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-[11px] text-zinc-500">{hint}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-2 border-t border-zinc-800/80 p-3">
          <button
            onClick={() => void handleQuickUpdate()}
            disabled={updateState.phase === "checking" || updateState.phase === "updating"}
            className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {updateState.phase === "checking" || updateState.phase === "updating" ? (
              <Loader2 className="h-4 w-4 animate-spin text-red-400" />
            ) : (
              <RefreshCw className="h-4 w-4 text-red-400" />
            )}
            <span className="min-w-0 flex-1 truncate text-left">
              {updateState.phase === "checking"
                ? "Verificando..."
                : updateState.phase === "updating"
                  ? "Atualizando..."
                  : "Atualizar apps"}
            </span>
          </button>
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
          <div className="flex items-center gap-2 text-[11px] text-zinc-600">
            <Cpu className="h-3.5 w-3.5" />
            Motores locais · v{appInfo?.version ?? "0.2.0"}
          </div>
        </div>
      </aside>

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
