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
    <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-zinc-900/60">
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(candidate.path)}
        className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-red-600"
      />
      <Icon className="h-4 w-4 shrink-0 text-zinc-500" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-zinc-200">{candidate.path}</p>
        <p className="truncate text-xs text-zinc-500">
          {label} · {candidate.reason}
        </p>
      </div>
      <span className="shrink-0 text-xs text-zinc-400">{formatBytes(candidate.sizeBytes)}</span>
    </label>
  );
}
