import { Folder, File } from "lucide-react";
import type { DiskUsageNode } from "@orun/system-optimizer";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex++;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

interface DiskUsageBarProps {
  node: DiskUsageNode;
  maxSizeBytes: number; // tamanho do maior item da lista, pra escalar a barra proporcionalmente
  onDelete?: (node: DiskUsageNode) => void;
}

export function DiskUsageBar({ node, maxSizeBytes, onDelete }: DiskUsageBarProps) {
  const percent = maxSizeBytes > 0 ? Math.max((node.sizeBytes / maxSizeBytes) * 100, 2) : 0;

  return (
    <div className="group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors duration-150 hover:bg-panel-2/60">
      {node.type === "directory" ? (
        <Folder className="h-4 w-4 shrink-0 text-ink-2" />
      ) : (
        <File className="h-4 w-4 shrink-0 text-ink-3" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm text-ink">{node.name}</span>
          <span className="shrink-0 text-xs text-ink-3">{formatBytes(node.sizeBytes)}</span>
        </div>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-sunken">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {onDelete && (
        <button
          onClick={() => onDelete(node)}
          className="shrink-0 rounded-md px-2 py-1 text-xs text-ink-3 opacity-0 transition-opacity duration-150 hover:bg-accent/10 hover:text-accent group-hover:opacity-100"
        >
          Excluir
        </button>
      )}
    </div>
  );
}

export { formatBytes };
