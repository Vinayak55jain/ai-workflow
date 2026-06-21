"use client";

import { useState } from "react";
import { Panel } from "@xyflow/react";
import { Play, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useWorkflowStore } from "@/lib/workflowStore";
import { useShallow } from "zustand/react/shallow";

type ExecutionMode = "full" | "single" | "multi";

interface CanvasToolbarProps {
  workflowId: string;
  onRunStart?: () => void;
}

export default function CanvasToolbar({ workflowId, onRunStart }: CanvasToolbarProps) {
  const { nodes, edges, undo, redo, setNodes, setEdges, takeSnapshot } = useWorkflowStore();
  const setNodeStatus = useWorkflowStore((s) => s.setNodeStatus);
  const clearNodeStatuses = useWorkflowStore((s) => s.clearNodeStatuses);

  const selectedNodeIds = useWorkflowStore(
    useShallow((s) => s.nodes.filter((n) => n.selected).map((n) => n.id))
  );

  const [mode, setMode] = useState<ExecutionMode>("full");
  const [isRunning, setIsRunning] = useState(false);

  const canRun = () => {
    if (mode !== "full" && selectedNodeIds.length === 0) return false;
    return true;
  };

  // Poll /api/workflows/[id]/runs until the run with runId is Completed or Failed,
  // pushing per-node statuses into the store as they change.
  function startPolling(runId: string) {
    clearNodeStatuses();
    let stopped = false;

    const poll = async () => {
      if (stopped) return;
      try {
        const res = await fetch(`/api/workflows/${workflowId}/runs`);
        if (!res.ok) return;
        const runs: {
          id: string;
          status: string;
          nodeExecutions: { nodeId: string; status: string }[];
        }[] = await res.json();

        const run = runs.find((r) => r.id === runId);
        if (!run) return;

        // Push every node's current status into the store
        for (const exec of run.nodeExecutions) {
          const normalized =
            exec.status === "Running"
              ? "Running"
              : exec.status === "Completed" || exec.status === "COMPLETED"
              ? "Completed"
              : exec.status === "Failed" || exec.status === "FAILED"
              ? "Failed"
              : null;
          if (normalized) setNodeStatus(exec.nodeId, normalized);
        }

        // Stop when the overall run is terminal
        if (run.status === "Completed" || run.status === "Failed") {
          stopped = true;
          setIsRunning(false);
          onRunStart?.(); // refresh sidebar one final time
          return;
        }
      } catch {
        // network error — keep trying
      }
      setTimeout(poll, 1500);
    };

    poll();
  }

  const handleRun = async () => {
    if (!canRun()) return;
    setIsRunning(true);

    try {
      const res = await fetch(`/api/workflows/${workflowId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          nodeIds: mode !== "full" ? selectedNodeIds : undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? `Request failed: ${res.status}`);
      }

      const { runId } = await res.json();
      toast.success("Workflow execution started");
      onRunStart?.();
      startPolling(runId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Execution failed: ${message}`);
      setIsRunning(false);
    }
  };

  const exportToJson = () => {
    const data = JSON.stringify({ nodes, edges }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `workflow-${workflowId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importFromJson = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const parsed = JSON.parse(text);
        if (parsed.nodes && parsed.edges) {
          setNodes(parsed.nodes);
          setEdges(parsed.edges);
          takeSnapshot();
        }
      } catch {
        console.error("Invalid JSON");
      }
    };
    input.click();
  };

  return (
    <Panel position="top-center" className="bg-white border border-zinc-200 shadow-sm rounded-lg flex items-center overflow-hidden h-10 mt-2">
      <div className="flex border-r border-zinc-200 h-full">
        {(["full", "single", "multi"] as ExecutionMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1 text-xs font-bold transition-colors capitalize ${
              mode === m ? "bg-blue-50 text-blue-600" : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <button
        onClick={handleRun}
        disabled={!canRun() || isRunning}
        className="flex items-center gap-1.5 px-4 h-full bg-green-50 hover:bg-green-100 text-green-700 border-r border-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold"
      >
        {isRunning
          ? <Loader2 size={14} className="animate-spin" />
          : <Play size={14} fill="currentColor" />}
        {isRunning ? "Running..." : "Run"}
      </button>

      <button onClick={undo} className="px-3 h-full text-zinc-600 hover:bg-zinc-50 border-r border-zinc-200 transition-colors text-xs font-semibold">Undo</button>
      <button onClick={redo} className="px-3 h-full text-zinc-600 hover:bg-zinc-50 border-r border-zinc-200 transition-colors text-xs font-semibold">Redo</button>
      <button onClick={exportToJson} className="px-3 h-full text-zinc-600 hover:bg-zinc-50 border-r border-zinc-200 transition-colors text-xs font-semibold">Export</button>
      <button onClick={importFromJson} className="px-3 h-full text-zinc-600 hover:bg-zinc-50 transition-colors text-xs font-semibold">Import</button>
    </Panel>
  );
}
