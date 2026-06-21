"use client";

import { useState, useEffect, useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import Uppy from "@uppy/core";
import Dashboard from "@uppy/dashboard";
import Transloadit from "@uppy/transloadit";
import "@uppy/core/css/style.css";
import "@uppy/dashboard/css/style.css";
import { Info, Copy, Trash2, GripVertical, Maximize2, Plus, Upload } from "lucide-react";
import { useWorkflowStore } from "@/lib/workflowStore";

// ── Single field row (text or image) ──────────────────────────────────────
function FieldRow({
  label,
  handleId,
  handleColor,
  children,
  onClear,
}: {
  label: string;
  handleId: string;
  handleColor: string;
  children: React.ReactNode;
  onClear?: () => void;
}) {
  return (
    <div className="mb-3 last:mb-0">
      {/* Row header */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-zinc-500">
          <GripVertical size={13} className="text-zinc-300 cursor-grab" />
          <span className="text-xs font-medium text-zinc-700">{label}</span>
          <Info size={12} className="text-zinc-350" />
        </div>
        <div className="flex items-center gap-1">
          <button
            className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors"
            title="Copy"
          >
            <Copy size={13} />
          </button>
          <button
            className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-red-500 transition-colors"
            title="Delete"
            onClick={onClear}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Content area — positioned relative so handle attaches to it */}
      <div className="relative">
        {children}
        {/* Output handle on the right edge, vertically centred */}
        <Handle
          type="source"
          id={handleId}
          position={Position.Right}
          style={{
            width: 13,
            height: 13,
            background: handleColor,
            border: "2.5px solid white",
            borderRadius: "50%",
            right: -22,
            top: "50%",
            transform: "translateY(-50%)",
            boxShadow: `0 0 0 2.5px ${handleColor}55`,
          }}
        />
      </div>
    </div>
  );
}

// ── Main node ─────────────────────────────────────────────────────────────
export default function RequestInputsNode({ id, data }: NodeProps) {
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);

  const config     = data?.config as { text_field?: string; image_field?: string } | undefined;
  const textValue  = config?.text_field  ?? "";
  const imageValue = config?.image_field ?? "";

  const [showUploader, setShowUploader] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Uppy Dashboard mounted imperatively — Uppy 4 has no React component
  useEffect(() => {
    if (!showUploader || !dashboardRef.current) return;

    const uppy = new Uppy({
      restrictions: { maxNumberOfFiles: 1, allowedFileTypes: ["image/*"] },
    });

    uppy.use(Transloadit, {
      async assemblyOptions() {
        const res = await fetch("/api/transloadit-params");
        if (!res.ok) throw new Error("Failed to get upload params");
        return res.json();
      },
      waitForEncoding: true,
    });

    uppy.use(Dashboard, {
      target: dashboardRef.current,
      inline: true,
      height: 320,
      width: 360,
      proudlyDisplayPoweredByUppy: false,
      note: "Upload one image (JPG, PNG, WebP)",
    });

    uppy.on("complete", (result) => {
      const uploadedFile = result.successful?.[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hostedUrl =
        (uploadedFile as any)?.transloadit?.results?.[":original"]?.[0]?.ssl_url ??
        uploadedFile?.uploadURL;
      if (hostedUrl) {
        updateNodeConfig(id, "image_field", hostedUrl);
        setShowUploader(false);
      }
    });

    return () => { uppy.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUploader]);

  return (
    <div className="bg-white rounded-2xl shadow-md ring-1 ring-zinc-200 w-[340px]">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-zinc-900">Request-Inputs</span>
          <Info size={13} className="text-zinc-400" />
        </div>
        <button className="w-7 h-7 rounded-lg bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-600 transition-colors">
          <Plus size={15} />
        </button>
      </div>

      <div className="px-4 pb-4 space-y-0">
        {/* ── text_field ── */}
        <FieldRow
          label="text_field"
          handleId="text_field"
          handleColor="#f97316"
          onClear={() => updateNodeConfig(id, "text_field", "")}
        >
          <div className="relative">
            <textarea
              value={textValue}
              onChange={(e) => updateNodeConfig(id, "text_field", e.target.value)}
              placeholder="Enter text…"
              className="w-full text-sm text-zinc-800 bg-zinc-50 border border-zinc-200 rounded-xl
                         px-3 py-2.5 resize-none focus:outline-none focus:ring-2
                         focus:ring-orange-300 transition-shadow min-h-[90px]"
            />
            {/* Resize icon hint — decorative, matches screenshot */}
            <Maximize2
              size={11}
              className="absolute bottom-2 right-2 text-zinc-300 rotate-90 pointer-events-none"
            />
          </div>
        </FieldRow>

        {/* ── image_field ── */}
        <FieldRow
          label="image_field"
          handleId="image_field"
          handleColor="#3b82f6"
          onClear={() => {
            updateNodeConfig(id, "image_field", "");
          }}
        >
          {imageValue ? (
            <div className="relative rounded-xl overflow-hidden border border-zinc-200">
              <img src={imageValue} alt="Uploaded" className="w-full h-24 object-cover" />
              <button
                onClick={() => setShowUploader(true)}
                className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100
                           text-white text-xs font-medium flex items-center justify-center
                           transition-opacity"
              >
                Replace
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowUploader(true)}
              className="w-full flex items-center justify-center gap-2 bg-zinc-100
                         hover:bg-zinc-200 border border-zinc-200 rounded-xl
                         py-3 text-sm text-zinc-500 font-medium transition-colors"
            >
              <Upload size={14} />
              Upload image
            </button>
          )}

          {/* Uppy Dashboard popover */}
          {showUploader && (
            <div className="absolute z-50 top-full left-0 mt-2 shadow-2xl rounded-xl
                            overflow-hidden border border-zinc-200 bg-white">
              <div ref={dashboardRef} />
              <button
                onClick={() => setShowUploader(false)}
                className="absolute top-2 right-2 z-10 text-zinc-400 hover:text-zinc-700
                           text-lg leading-none"
              >
                ✕
              </button>
            </div>
          )}
        </FieldRow>
      </div>
    </div>
  );
}
