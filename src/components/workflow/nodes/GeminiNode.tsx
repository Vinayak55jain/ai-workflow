"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";
import {
  Play, MoreHorizontal, Info, RotateCcw,
  Plus, Upload, ChevronRight,
} from "lucide-react";
import { useWorkflowStore } from "@/lib/workflowStore";
import { resolveLiveValue } from "@/lib/dag/resolveLiveValue";
import { useState } from "react";

// ─── handle dot colours matching the screenshot ────────────────────────────
const HANDLE_COLORS = {
  prompt:        "#f97316", // orange
  system_prompt: "#f97316", // orange
  image:         "#3b82f6", // blue
  video:         "#22c55e", // green
  audio:         "#06b6d4", // cyan
  file:          "#a855f7", // purple
  response:      "#f97316", // orange (output)
};

// ─── Shared dot style helper ───────────────────────────────────────────────
function dotStyle(
  color: string,
  side: "left" | "right",
  offset: number = 0
): React.CSSProperties {
  return {
    width: 13,
    height: 13,
    background: color,
    border: "2.5px solid white",
    borderRadius: "50%",
    [side]: -22,
    top: "50%",
    transform: `translateY(calc(-50% + ${offset}px))`,
    boxShadow: `0 0 0 2.5px ${color}40`,
    position: "absolute",
  };
}

// ─── Prompt / System-Prompt textarea row ───────────────────────────────────
function PromptRow({
  nodeId,
  handleId,
  label,
  placeholder,
  required = false,
  showAdd = false,
  minH = "min-h-[90px]",
}: {
  nodeId: string;
  handleId: string;
  label: string;
  placeholder: string;
  required?: boolean;
  showAdd?: boolean;
  minH?: string;
}) {
  const { nodes, edges, updateNodeConfig } = useWorkflowStore();
  const { value, isConnected } = resolveLiveValue(nodeId, handleId, nodes, edges);
  const color = HANDLE_COLORS[handleId as keyof typeof HANDLE_COLORS] ?? "#f97316";

  return (
    <div className="relative">
      {/* Handle */}
      <Handle
        id={handleId}
        type="target"
        position={Position.Left}
        style={dotStyle(color, "left")}
      />

      {/* Label row */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1">
          <span className="text-xs font-semibold text-zinc-700">
            {label}
            {required && <span className="text-red-500 ml-0.5">*</span>}
          </span>
          <Info size={11} className="text-zinc-400" />
        </div>
        {showAdd && (
          <button className="p-1 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-500 transition-colors">
            <Plus size={12} />
          </button>
        )}
      </div>

      {/* Textarea */}
      <textarea
        value={value as string}
        readOnly={isConnected}
        disabled={isConnected}
        placeholder={isConnected ? undefined : placeholder}
        onChange={(e) => {
          if (!isConnected) updateNodeConfig(nodeId, handleId, e.target.value);
        }}
        className={`w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm text-zinc-800
          placeholder:text-zinc-400 resize-none focus:outline-none focus:ring-2
          focus:ring-orange-300 transition-shadow ${minH} ${
          isConnected ? "bg-zinc-100 cursor-not-allowed text-zinc-500" : "bg-zinc-50"
        }`}
      />
    </div>
  );
}

// ─── Media upload row (Image / Video / Audio / File) ──────────────────────
function MediaRow({
  nodeId,
  handleId,
  label,
  accept,
  uploadLabel,
  color,
  readAs = "dataURL",
}: {
  nodeId: string;
  handleId: string;
  label: string;
  accept: string;
  uploadLabel: string;
  color: string;
  readAs?: "dataURL" | "text";
}) {
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);
  const isConnected = useWorkflowStore((s) =>
    s.edges.some((e) => e.target === nodeId && e.targetHandle === handleId)
  );
  const fileName = useWorkflowStore((s) => {
    const cfg = s.nodes.find((n) => n.id === nodeId)?.data?.config as
      | Record<string, string>
      | undefined;
    const raw = cfg?.[`${handleId}_name`];
    return raw ?? null;
  });

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      useWorkflowStore.getState().updateNodeConfig(nodeId, handleId, reader.result as string);
      useWorkflowStore.getState().updateNodeConfig(nodeId, `${handleId}_name`, file.name);
      useWorkflowStore.getState().updateNodeConfig(nodeId, `${handleId}_mime`, file.type);
    };
    if (readAs === "dataURL") reader.readAsDataURL(file);
    else reader.readAsText(file);
  }

  return (
    <div className="flex items-center gap-3 relative">
      <Handle
        id={handleId}
        type="target"
        position={Position.Left}
        style={dotStyle(color, "left")}
      />

      <span className="text-xs font-medium text-zinc-700 w-[72px] shrink-0">{label}</span>

      <label
        className={`flex-1 flex items-center justify-center gap-2 border rounded-xl py-2
          text-xs font-medium cursor-pointer transition-colors
          ${isConnected
            ? "border-zinc-200 bg-zinc-100 text-zinc-400 cursor-not-allowed pointer-events-none"
            : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100"
          }`}
      >
        {fileName ? (
          <span className="truncate max-w-[130px] text-zinc-700">{fileName}</span>
        ) : (
          <>
            <Upload size={13} />
            {uploadLabel}
          </>
        )}
        {!isConnected && (
          <input
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        )}
      </label>

      <button
        className="p-1.5 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-500 transition-colors"
        title="Clear"
        onClick={() => {
          updateNodeConfig(nodeId, handleId, "");
          updateNodeConfig(nodeId, `${handleId}_name`, "");
        }}
      >
        <Plus size={12} />
      </button>
    </div>
  );
}

// ─── Main node ─────────────────────────────────────────────────────────────
export default function GeminiNode({ id, selected }: NodeProps) {
  const executionStatus = useWorkflowStore((s) => s.nodeStatuses[id]);
  const isRunning = executionStatus === "Running";
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div
      className={`bg-white rounded-2xl shadow-lg w-[420px] transition-all ${
        selected ? "ring-2 ring-orange-400" : "ring-1 ring-zinc-200"
      }`}
      style={{ animation: isRunning ? "pulse-glow 2s infinite" : "none" }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-100">
        <span className="font-semibold text-sm text-zinc-900">Gemini 3.1 Pro</span>
        <div className="flex items-center gap-2">
          <button className="text-zinc-400 hover:text-zinc-600">
            <Info size={15} />
          </button>
          <button className="text-zinc-400 hover:text-zinc-600">
            <RotateCcw size={14} />
          </button>
          <button className="flex items-center gap-1.5 bg-green-100 hover:bg-green-200 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors">
            <Play size={11} fill="currentColor" />
            Run
          </button>
          <button className="text-zinc-400 hover:text-zinc-600">
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* ── Prompt ── */}
        <PromptRow
          nodeId={id}
          handleId="prompt"
          label="Prompt"
          placeholder="Enter your prompt…"
          required
        />

        {/* ── System Prompt ── */}
        <PromptRow
          nodeId={id}
          handleId="system_prompt"
          label="System Prompt"
          placeholder="You are a helpful assistant…"
          showAdd
          minH="min-h-[70px]"
        />

        {/* ── Media inputs ── */}
        <div className="space-y-2.5">
          <MediaRow
            nodeId={id}
            handleId="image"
            label="Image (Vision)"
            accept="image/*"
            uploadLabel="Upload image"
            color={HANDLE_COLORS.image}
          />
          <MediaRow
            nodeId={id}
            handleId="video"
            label="Video"
            accept="video/*"
            uploadLabel="Upload video"
            color={HANDLE_COLORS.video}
          />
          <MediaRow
            nodeId={id}
            handleId="audio"
            label="Audio"
            accept="audio/*"
            uploadLabel="Upload audio"
            color={HANDLE_COLORS.audio}
          />
          <MediaRow
            nodeId={id}
            handleId="file"
            label="File"
            accept=".pdf,.txt,.csv,.docx,.md"
            uploadLabel="Upload file"
            color={HANDLE_COLORS.file}
            readAs="text"
          />
        </div>

        {/* ── Settings collapsible ── */}
        <button
          onClick={() => setSettingsOpen((v) => !v)}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
        >
          <ChevronRight
            size={13}
            className={`transition-transform ${settingsOpen ? "rotate-90" : ""}`}
          />
          Settings
        </button>
        {settingsOpen && (
          <div className="bg-zinc-50 rounded-xl p-3 text-xs text-zinc-500 border border-zinc-100">
            Temperature, top-k, top-p controls coming soon.
          </div>
        )}

        {/* ── Response output ── */}
        <div className="relative">
          <p className="text-xs font-medium text-zinc-700 mb-2">Response</p>
          <div
            className={`rounded-xl border border-zinc-200 flex items-center justify-center min-h-[80px] text-xs font-medium p-3 transition-colors ${
              executionStatus === "Completed"
                ? "bg-green-50 text-green-700"
                : executionStatus === "Failed"
                ? "bg-red-50 text-red-600"
                : executionStatus === "Running"
                ? "bg-orange-50 text-orange-600"
                : "bg-zinc-50 text-zinc-400"
            }`}
          >
            {executionStatus === "Completed"
              ? "✓ Completed"
              : executionStatus === "Failed"
              ? "✗ Failed"
              : executionStatus === "Running"
              ? "⏳ Generating…"
              : "No output yet"}
          </div>

          {/* Orange output handle on the right */}
          <Handle
            id="response"
            type="source"
            position={Position.Right}
            style={dotStyle(HANDLE_COLORS.response, "right")}
          />
        </div>

        {/* ── Cost badge ── */}
        <div className="flex justify-end">
          <span className="text-[10px] text-zinc-400 font-medium bg-zinc-100 rounded-full px-2 py-0.5">
            ~0.000M
          </span>
        </div>
      </div>
    </div>
  );
}
