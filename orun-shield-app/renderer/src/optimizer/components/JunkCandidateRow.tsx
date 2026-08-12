import { Trash2, Archive, FileText, FolderX, MonitorX, PackageX } from "lucide-react";
import type { JunkCandidate, JunkCategory } from "@orun/system-optimizer";
import { formatBytes } from "./DiskUsageBar";

const CATEGORY_CONFIG: Record<JunkCategory, { label: string; Icon: typeof Trash2 }> = {
  "temp-file": { label: "Arquivo temporário", Icon: Trash2 },
  cache: { label: "Cache", Icon: Archive },
  "log-file": { label: "Log", Icon: FileText },
  "old-installer": { label: "Instalador antigo", Icon: PackageX },
  "empty-folder": { label: "Pasta vazia", Icon: FolderX },
  "os-junk": { label: "Metadado do SO", Icon: MonitorX },
  "trash-recycle-bin": { label: "Lixeira", Icon: Trash2 },
  "old-downloads": { label: "Download antigo", Icon: PackageX },
};

interface JunkCandidateRowProps {
  candidate: JunkCandidate;
  selected: boolean;
  onToggle: (path: string) => void;
}

export function JunkCandidateRow({ candidate, selected, onToggle }: JunkCandidateRowProps) {
  const { label, Icon } = CATEGORY_CONFIG[candidate.category];

  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors duration-150 hover:bg-panel-2/60">
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(candidate.path)}
        className="h-4 w-4 rounded border-line-2 bg-sunken accent-[#ff2e36]"
      />
      <Icon className="h-4 w-4 shrink-0 text-ink-3" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">{candidate.path}</p>
        <p className="truncate text-xs text-ink-3">
          {label} · {candidate.reason}
        </p>
      </div>
      <span className="shrink-0 text-xs text-ink-2">{formatBytes(candidate.sizeBytes)}</span>
    </label>
  );
}
