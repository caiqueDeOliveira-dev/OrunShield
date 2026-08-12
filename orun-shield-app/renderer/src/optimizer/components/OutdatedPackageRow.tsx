import { ArrowUpCircle, Loader2 } from "lucide-react";
import type { OutdatedPackage } from "@orun/system-optimizer";

interface OutdatedPackageRowProps {
  pkg: OutdatedPackage;
  isUpdating: boolean;
  onUpdate: (packageId: string) => void;
}

export function OutdatedPackageRow({ pkg, isUpdating, onUpdate }: OutdatedPackageRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm text-zinc-200">{pkg.displayName}</p>
        <p className="text-xs text-zinc-500">
          {pkg.currentVersion} → <span className="text-emerald-400">{pkg.availableVersion}</span>
        </p>
      </div>
      <button
        onClick={() => onUpdate(pkg.id)}
        disabled={isUpdating}
        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-900/40 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-900/70 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpCircle className="h-3.5 w-3.5" />}
        {isUpdating ? "Atualizando..." : "Atualizar"}
      </button>
    </div>
  );
}
