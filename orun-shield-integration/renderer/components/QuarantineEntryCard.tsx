import { ShieldX, RotateCcw, Trash2 } from "lucide-react";
import type { QuarantineEntry } from "@orun/shield-core";

interface QuarantineEntryCardProps {
  entry: QuarantineEntry;
  onRestore: (id: string) => void;
  onDeletePermanently: (id: string) => void;
}

export function QuarantineEntryCard({ entry, onRestore, onDeletePermanently }: QuarantineEntryCardProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="flex items-center gap-3 overflow-hidden">
        <ShieldX className="h-4 w-4 shrink-0 text-orange-400" />
        <div className="overflow-hidden">
          <p className="truncate text-sm text-zinc-200">{entry.originalPath}</p>
          <p className="text-xs text-zinc-500">
            {entry.finding.title} · isolado em {new Date(entry.quarantinedAt).toLocaleString("pt-BR")}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        <button
          onClick={() => onRestore(entry.id)}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          title="Restaurar pro local original (só se tiver certeza de que é falso positivo)"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restaurar
        </button>
        <button
          onClick={() => onDeletePermanently(entry.id)}
          className="flex items-center gap-1.5 rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/40"
          title="Apagar definitivamente — ação irreversível"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Apagar
        </button>
      </div>
    </div>
  );
}
