import { useState } from "react";
import { ChevronRight, ChevronDown, Cpu } from "lucide-react";
import type { ProcessTreeNode } from "@orun/shield-core";

interface ProcessTreeViewProps {
  nodes: ProcessTreeNode[];
}

export function ProcessTreeView({ nodes }: ProcessTreeViewProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {nodes.map((node) => (
        <ProcessTreeItem key={node.pid} node={node} depth={0} />
      ))}
    </div>
  );
}

function ProcessTreeItem({ node, depth }: { node: ProcessTreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 1); // primeiro nível já vem aberto
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <button
        onClick={() => hasChildren && setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-zinc-900/60"
        style={{ paddingLeft: `${depth * 16 + 6}px` }}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-zinc-500" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-zinc-500" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <Cpu className="h-3 w-3 shrink-0 text-zinc-600" />
        <span className="text-zinc-300">{node.name}</span>
        <span className="text-zinc-600">PID {node.pid}</span>
        {node.cpu > 1 && <span className="ml-auto text-zinc-500">{node.cpu.toFixed(1)}% CPU</span>}
      </button>

      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <ProcessTreeItem key={child.pid} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
