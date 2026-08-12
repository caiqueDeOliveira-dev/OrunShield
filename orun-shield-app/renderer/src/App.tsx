import { useState } from "react";
import { ShieldCheck, Sparkles, Cpu } from "lucide-react";
import { ShieldScreen } from "./shield/screens/ShieldScreen";
import { OptimizerScreen } from "./optimizer/screens/OptimizerScreen";

type View = "shield" | "optimizer";

const NAV: { id: View; label: string; hint: string; Icon: typeof ShieldCheck }[] = [
  { id: "shield", label: "Shield", hint: "Antivírus", Icon: ShieldCheck },
  { id: "optimizer", label: "Otimizador", hint: "Limpeza e updates", Icon: Sparkles },
];

export default function App() {
  const [view, setView] = useState<View>("shield");

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

        <div className="mt-auto border-t border-zinc-800/80 p-3">
          <div className="flex items-center gap-2 text-[11px] text-zinc-600">
            <Cpu className="h-3.5 w-3.5" />
            Motores locais · v0.1.0
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-hidden">
        {view === "shield" ? <ShieldScreen /> : <OptimizerScreen />}
      </main>
    </div>
  );
}
