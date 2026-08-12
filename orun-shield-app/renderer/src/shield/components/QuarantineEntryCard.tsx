import { ShieldX, RotateCcw, Trash2 } from "lucide-react";
import type { QuarantineEntry } from "@orun/shield-core";

interface QuarantineEntryCardProps {
  entry: QuarantineEntry;
  onRestore: (id: string) => void;
  onDeletePermanently: (id: string) => void;
}

export function QuarantineEntryCard({ entry, onRestore, onDeletePermanently }: QuarantineEntryCardProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel-2/60 p-3.5 shadow-panel">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent ring-1 ring-accent/20">
          <ShieldX className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">{entry.originalPath}</p>
          <p className="truncate text-xs text-ink-3">
            {entry.finding.title} · isolado em {new Date(entry.quarantinedAt).toLocaleString("pt-BR")}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        <button
          onClick={() => onRestore(entry.id)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line-2 bg-panel px-3 py-1.5 text-xs text-ink-2 transition-colors duration-150 hover:border-line-2 hover:text-ink"
          title="Restaurar pro local original (só se tiver certeza de que é falso positivo)"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restaurar
        </button>
        <button
          onClick={() => onDeletePermanently(entry.id)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/10 px-3 py-1.5 text-xs text-accent transition-colors duration-150 hover:bg-accent/20"
          title="Apagar definitivamente — ação irreversível"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Apagar
        </button>
      </div>
    </div>
  );
}
