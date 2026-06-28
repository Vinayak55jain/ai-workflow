"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";
import { Play, MoreHorizontal, Info, RotateCcw, Plus, Upload } from "lucide-react";
import { useWorkflowStore } from "@/lib/workflowStore";
import { useEffect } from "react";

// ─── Slider row matching the screenshot ────────────────────────────────────
function SliderRow({
  nodeId,
  handleId,
  label,
  min = 0,
  max = 100,
  defaultValue = 0,
}: {
  nodeId: string;
  handleId: string;
  label: string;
  min?: number;
  max?: number;
  defaultValue?: number;
}) {
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);
  const rawValue = useWorkflowStore(
    (s) => s.nodes.find((n) => n.id === nodeId)?.data?.config as Record<string, number> | undefined
  );
  const value: number = rawValue?.[handleId] ?? defaultValue;

  return (
    <div className="flex items-center gap-2 relative">
      {/* Pink handle on the left — connectable input */}
      <Handle
        type="target"
        id={handleId}
        position={Position.Left}
        style={{
          width: 12,
          height: 12,
          background: "#ec4899",
          border: "2px solid white",
          borderRadius: "50%",
          left: -20,
          top: "50%",
          transform: "translateY(-50%)",
        }}
      />

      {/* Label + info icon */}
      <div className="flex items-center gap-1 w-[100px] shrink-0">
        <span className="text-xs font-medium text-zinc-700">{label}</span>
        <Info size={11} className="text-zinc-400" />
      </div>

      {/* Slider */}
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => updateNodeConfig(nodeId, handleId, Number(e.target.value))}
        className="flex-1 h-1.5 appearance-none rounded-full bg-zinc-200 accent-indigo-500 cursor-pointer"
      />

      {/* Numeric input box */}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!isNaN(n)) updateNodeConfig(nodeId, handleId, Math.min(max, Math.max(min, n)));
        }}
        className="w-12 text-center text-xs border border-zinc-200 rounded-lg py-1 bg-zinc-50 text-zinc-800 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />

      {/* Reset button */}
      <button
        onClick={() => updateNodeConfig(nodeId, handleId, defaultValue)}
        className="p-1 rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100 transition-colors"
        title="Reset"
      >
        <RotateCcw size={11} />
      </button>

      {/* + button (increment by 1) */}
      <button
        onClick={() => updateNodeConfig(nodeId, handleId, Math.min(max, value + 1))}
        className="p-1 rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100 transition-colors"
        title="Increment"
      >
        <Plus size={11} />
      </button>
    </div>
  );
}

// ─── Main node ──────────────────────────────────────────────────────────────
export default function CropImageNode({ id, data, selected }: NodeProps) {
  const executionStatus = useWorkflowStore((s) => s.nodeStatuses[id]);
  const isRunning = executionStatus === "Running";
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);

  const config = data?.config as Record<string, any> | undefined;
  const imageValue = config?.image_field;

  // Set default image for testing if not yet defined
  useEffect(() => {
    if (config?.image_field === undefined) {
      updateNodeConfig(
        id,
        "image_field",
        "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=1000&auto=format&fit=crop"
      );
    }
  }, [config?.image_field, id, updateNodeConfig]);

  return (
    <div
      className={`bg-white rounded-2xl shadow-lg w-[380px] transition-all ${
        selected ? "ring-2 ring-blue-400" : "ring-1 ring-zinc-200"
      }`}
      style={{ animation: isRunning ? "pulse-glow 2s infinite" : "none" }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3.5">
        <span className="font-semibold text-sm text-zinc-900">Crop Image</span>
        <div className="flex items-center gap-2">
          <button className="text-zinc-400 hover:text-zinc-600 transition-colors">
            <Info size={16} />
          </button>
          <button className="text-zinc-400 hover:text-zinc-600 transition-colors">
            <RotateCcw size={15} />
          </button>
          {/* Run button — green pill */}
          <button className="flex items-center gap-1.5 bg-green-100 hover:bg-green-200 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors">
            <Play size={11} fill="currentColor" />
            Run
          </button>
          <button className="text-zinc-400 hover:text-zinc-600 transition-colors">
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      <div className="px-5 pb-5 space-y-4">
        {/* ── Input Image row ── */}
        <div className="flex items-center gap-3 relative">
          {/* Blue handle for image input — matches screenshot */}
          <Handle
            id="image_in"
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
              boxShadow: "0 0 0 2px #bfdbfe",
            }}
          />

          <span className="text-xs font-medium text-zinc-700 w-[100px] shrink-0">
            Input Image<span className="text-red-500">*</span>
          </span>

          {/* Upload area */}
          <label className="flex-1 flex items-center justify-center gap-2 border border-zinc-200 rounded-xl bg-zinc-50 hover:bg-zinc-100 cursor-pointer transition-colors text-zinc-500 overflow-hidden relative" style={{ height: "42px" }}>
            {imageValue ? (
              <img src={imageValue} alt="Input" className="w-full h-full object-cover" />
            ) : (
              <>
                <Upload size={14} />
                <span className="text-xs font-medium">Upload Image</span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () =>
                  updateNodeConfig(id, "image_field", reader.result as string);
                reader.readAsDataURL(file);
              }}
            />
          </label>
        </div>

        {/* ── Divider ── */}
        <div className="border-t border-zinc-100" />

        {/* ── Slider rows ── */}
        <div className="space-y-3">
          <SliderRow nodeId={id} handleId="x_position" label="X Position (%)" defaultValue={20} />
          <SliderRow nodeId={id} handleId="y_position" label="Y Position (%)" defaultValue={20} />
          <SliderRow nodeId={id} handleId="width"      label="Width (%)"      defaultValue={60} />
          <SliderRow nodeId={id} handleId="height"     label="Height (%)"     defaultValue={60} />
        </div>

        {/* ── Divider ── */}
        <div className="border-t border-zinc-100" />

        {/* ── Output Image ── */}
        <div className="relative">
          <p className="text-xs font-medium text-zinc-700 mb-2">Output Image</p>
          <div
            className={`rounded-xl border border-zinc-200 flex items-center justify-center h-24 text-xs font-medium transition-colors ${
              executionStatus === "Completed"
                ? "bg-green-50 text-green-700"
                : executionStatus === "Failed"
                ? "bg-red-50 text-red-600"
                : executionStatus === "Running"
                ? "bg-indigo-50 text-indigo-600"
                : "bg-zinc-50 text-zinc-400"
            }`}
          >
            {executionStatus === "Completed"
              ? "✓ Cropped"
              : executionStatus === "Failed"
              ? "✗ Failed"
              : executionStatus === "Running"
              ? "⏳ Cropping…"
              : "No output yet"}
          </div>

          {/* Blue source handle on the right — matches screenshot */}
          <Handle
            id="image_out"
            type="source"
            position={Position.Right}
            style={{
              width: 14,
              height: 14,
              background: "#3b82f6",
              border: "2.5px solid white",
              borderRadius: "50%",
              right: -22,
              top: "50%",
              transform: "translateY(-50%)",
              boxShadow: "0 0 0 2px #bfdbfe",
            }}
          />
        </div>

        {/* ── Cost badge (bottom-right decoration) ── */}
        <div className="flex justify-end">
          <span className="text-[10px] text-zinc-400 font-medium bg-zinc-100 rounded-full px-2 py-0.5">
            ~0.005M
          </span>
        </div>
      </div>
    </div>
  );
}
