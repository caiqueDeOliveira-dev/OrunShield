import { ArrowUpCircle } from "lucide-react";
import type { OutdatedPackage } from "@orun/system-optimizer";
import { Button, Panel, Spinner } from "../../ui";

interface OutdatedPackageRowProps {
  pkg: OutdatedPackage;
  isUpdating: boolean;
  onUpdate: (packageId: string) => void;
}

export function OutdatedPackageRow({ pkg, isUpdating, onUpdate }: OutdatedPackageRowProps) {
  return (
    <Panel className="flex items-center justify-between gap-3 p-3.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{pkg.displayName}</p>
        <p className="text-xs text-ink-3">
          {pkg.currentVersion} → <span className="text-emerald-400">{pkg.availableVersion}</span>
        </p>
      </div>
      <Button
        variant="danger"
        className="shrink-0 px-3 py-1.5 text-xs"
        icon={isUpdating ? <Spinner className="h-3.5 w-3.5" /> : <ArrowUpCircle className="h-3.5 w-3.5" />}
        onClick={() => onUpdate(pkg.id)}
        disabled={isUpdating}
      >
        {isUpdating ? "Atualizando..." : "Atualizar"}
      </Button>
    </Panel>
  );
}
