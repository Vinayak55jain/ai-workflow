"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

interface RunNodeExecution {
  id: string;
  nodeId: string;
  status: string;
  input: any;
  output: any;
  startedAt: string;
  finishedAt: string | null;
}

interface RunCardProps {
  run: {
    id: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    nodeExecutions: RunNodeExecution[];
  };
}

function computeDuration(startedAt: string, finishedAt: string | null): string | null {
  if (!finishedAt) return null;
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  return `${Math.round(ms / 1000)}s`;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "Running":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 text-blue-700">
          <Loader2 size={11} className="animate-spin" />
          Running
        </span>
      );
    case "Completed":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-green-100 text-green-700">
          ✓ Completed
        </span>
      );
    case "Failed":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-red-100 text-red-700">
          ✗ Failed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-zinc-100 text-zinc-600">
          {status}
        </span>
      );
  }
}

function NodeStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "Running":
      return <Loader2 size={13} className="animate-spin text-blue-600 shrink-0" />;
    case "Completed":
      return <span className="text-green-600 font-bold shrink-0 leading-none">✓</span>;
    case "Failed":
      return <span className="text-red-600 font-bold shrink-0 leading-none">✗</span>;
    default:
      return <span className="text-zinc-400 shrink-0">•</span>;
  }
}

export default function RunCard({ run }: RunCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const duration = computeDuration(run.startedAt, run.finishedAt);
  const formattedStart = format(new Date(run.startedAt), "MMM d HH:mm:ss");

  return (
    <div className="border border-zinc-200 rounded-lg overflow-hidden bg-white shadow-sm">
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-zinc-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isExpanded ? (
            <ChevronDown size={14} className="text-zinc-400 shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-zinc-400 shrink-0" />
          )}
          <span className="text-xs font-mono text-zinc-600 truncate">{formattedStart}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {duration && (
            <span className="text-xs text-zinc-400 font-medium">{duration}</span>
          )}
          <StatusBadge status={run.status} />
        </div>
      </button>

      {/* Expanded section */}
      {isExpanded && (
        <div className="border-t border-zinc-100 divide-y divide-zinc-100">
          {run.nodeExecutions.length === 0 ? (
            <p className="px-3 py-3 text-xs text-zinc-400 italic">No node executions recorded.</p>
          ) : (
            run.nodeExecutions.map((exec) => {
              const nodeDuration = computeDuration(exec.startedAt, exec.finishedAt);
              const isFailed = exec.status === "Failed";

              return (
                <div
                  key={exec.id}
                  className={`px-3 py-2.5 ${isFailed ? "bg-red-50" : ""}`}
                >
                  {/* Node row header */}
                  <div className="flex items-center gap-2 mb-2">
                    <NodeStatusIcon status={exec.status} />
                    <span className="text-xs font-mono text-zinc-700 font-semibold">
                      {exec.nodeId.length > 8 ? `${exec.nodeId.slice(0, 8)}...` : exec.nodeId}
                    </span>
                    {nodeDuration && (
                      <span className="text-xs text-zinc-400 ml-auto">{nodeDuration}</span>
                    )}
                  </div>

                  {/* Input */}
                  <div className="mb-1.5">
                    <p className="text-[10px] font-semibold uppercase text-zinc-400 mb-0.5 tracking-wide">Input</p>
                    <pre className="text-xs bg-zinc-100 p-2 rounded overflow-x-auto">
                      {exec.input != null
                        ? JSON.stringify(exec.input, null, 2)
                        : "null"}
                    </pre>
                  </div>

                  {/* Output */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-zinc-400 mb-0.5 tracking-wide">Output</p>
                    <pre className="text-xs bg-zinc-100 p-2 rounded overflow-x-auto">
                      {exec.output != null
                        ? JSON.stringify(exec.output, null, 2)
                        : "null"}
                    </pre>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
