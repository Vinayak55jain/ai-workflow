"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Info, Pencil, Trash2 } from "lucide-react";
import { useWorkflowStore } from "@/lib/workflowStore";

// Resolve the actual response text from any connected upstream node
function useResponseText(nodeId: string): string | null {
  const edges = useWorkflowStore((s) => s.edges);
  const nodes = useWorkflowStore((s) => s.nodes);
  // Find an edge whose target is this node
  const incomingEdge = edges.find((e) => e.target === nodeId);
  if (!incomingEdge) return null;
  const sourceNode = nodes.find((n) => n.id === incomingEdge.source);
  if (!sourceNode) return null;
  const cfg = sourceNode.data?.config as Record<string, unknown> | undefined;
  const val = cfg?.response ?? cfg?.text_field ?? cfg?.output;
  return typeof val === "string" ? val : null;
}

// Label that shows the source node's type, matching "gemini_3_1_pro" style
function useSourceLabel(nodeId: string): string {
  const edges = useWorkflowStore((s) => s.edges);
  const nodes = useWorkflowStore((s) => s.nodes);
  const incomingEdge = edges.find((e) => e.target === nodeId);
  if (!incomingEdge) return "";
  const sourceNode = nodes.find((n) => n.id === incomingEdge.source);
  if (!sourceNode) return "";
  // Convert "GeminiModel" → "gemini_3_1_pro", "RequestInput" → "request_inputs", etc.
  const map: Record<string, string> = {
    GeminiModel:  "gemini_3_1_pro",
    RequestInput: "request_inputs",
    CropImage:    "crop_image",
  };
  return map[sourceNode.type ?? ""] ?? (sourceNode.type ?? "").toLowerCase();
}

export default function ResponseNode({ id, selected }: NodeProps) {
  const responseText = useResponseText(id);
  const sourceLabel  = useSourceLabel(id);
  const executionStatus = useWorkflowStore((s) => s.nodeStatuses[id]);

  // Determine displayed text
  const displayText =
    executionStatus === "Running"   ? "⏳ Generating…"    :
    executionStatus === "Completed" ? responseText ?? "Completed" :
    executionStatus === "Failed"    ? "✗ Failed"          :
    null;

  return (
    <div
      className={`bg-white rounded-2xl shadow-md w-[420px] transition-all ${
        selected ? "ring-2 ring-blue-400" : "ring-1 ring-zinc-200"
      }`}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100">
        {/* Purple icon box */}
        <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              stroke="#6366f1"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <span className="font-semibold text-sm text-zinc-900">Response</span>
        <Info size={13} className="text-zinc-400" />
      </div>

      {/* ── Body ── */}
      <div className="px-5 py-4">
        {/* "result" label row with blue input handle */}
        <div className="relative flex items-center mb-4">
          <Handle
            id="input"
            type="target"
            position={Position.Left}
            style={{
              width: 14,
              height: 14,
              background: "#3b82f6",
              border: "2.5px solid white",
              borderRadius: "50%",
              left: -22,
              top: "50%",
              transform: "translateY(-50%)",
              boxShadow: "0 0 0 2.5px #93c5fd",
            }}
          />
          <span className="text-sm font-medium text-zinc-600 ml-1">result</span>
        </div>

        {/* Inner card */}
        <div className="bg-zinc-50 rounded-xl border border-zinc-200 overflow-hidden">
          {/* Source node label row */}
          {sourceLabel && (
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200">
              <span className="text-sm font-medium text-zinc-700">{sourceLabel}</span>
              <div className="flex items-center gap-1">
                <button className="p-1 rounded hover:bg-zinc-200 text-zinc-400 transition-colors">
                  <Pencil size={13} />
                </button>
                <button className="p-1 rounded hover:bg-zinc-200 text-zinc-400 hover:text-red-500 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          )}

          {/* Output display */}
          <div
            className={`px-4 py-4 min-h-[80px] flex items-center justify-center rounded-b-xl
              text-sm transition-colors ${
              executionStatus === "Completed" && displayText
                ? "bg-white text-zinc-800 items-start"
                : executionStatus === "Failed"
                ? "bg-red-50 text-red-600"
                : executionStatus === "Running"
                ? "bg-orange-50 text-orange-600"
                : "bg-white text-zinc-400"
            }`}
          >
            {displayText ? (
              <p className="text-sm whitespace-pre-wrap w-full">{displayText}</p>
            ) : (
              <span className="text-zinc-400 text-sm">No output yet</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
