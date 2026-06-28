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

      <div className="relative">
        {children}
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

export default function RequestInputsNode({ id, data }: NodeProps) {
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);

  const config     = data?.config as { text_field?: string; image_field?: string } | undefined;
  const textValue  = config?.text_field  ?? "";
  const imageValue = config?.image_field ?? "";

  const [showUploader, setShowUploader] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!showUploader || !dashboardRef.current) return;

    const uppy = new Uppy({
      restrictions: { maxNumberOfFiles: 1, allowedFileTypes: ["image/*"] },
    });

    uppy.use(Transloadit, {
      async assemblyOptions() {
        const res = await fetch("/api/transloadit-signature", {
          method: "POST",
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err?.error ?? "Failed to get upload params");
        }

        const { params, signature } = await res.json();

        return {
          params,     // ✅ plain object — no JSON.parse needed
          signature,  // ✅ "sha384:abc123..."
        };
      },
      waitForEncoding: true, // ✅ true because template has a "resized" encoding step
    });

    uppy.use(Dashboard, {
      target: dashboardRef.current,
      inline: true,
      height: 320,
      width: 360,
      proudlyDisplayPoweredByUppy: false,
      note: "Upload one image (JPG, PNG, WebP)",
    });

    // ✅ Get URL from "resized" step (your template's final step)
    uppy.on("transloadit:result", (stepName, result) => {
      if (stepName === "resized") {
        const hostedUrl = result?.ssl_url ?? result?.url;
        if (hostedUrl) {
          updateNodeConfig(id, "image_field", hostedUrl);
          setShowUploader(false);
        }
      }
    });

    // ✅ Fallback if transloadit:result doesn't fire
    uppy.on("complete", (result) => {
      const file = result.successful?.[0];
      const fallbackUrl = file?.uploadURL;
      if (fallbackUrl) {
        updateNodeConfig(id, "image_field", fallbackUrl);
        setShowUploader(false);
      }
    });

    // ✅ Log errors clearly
    uppy.on("error", (error) => {
    console.error("❌ Uppy error:", error);
    });

    uppy.on("transloadit:assembly-error", (assembly, error) => {
      console.error("❌ Transloadit assembly error:", error, assembly);
    });

    return () => { uppy.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUploader]);

  return (
    <div className="bg-white rounded-2xl shadow-md ring-1 ring-zinc-200 w-[340px]">
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
        {/* text_field */}
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
            <Maximize2
              size={11}
              className="absolute bottom-2 right-2 text-zinc-300 rotate-90 pointer-events-none"
            />
          </div>
        </FieldRow>

        {/* image_field */}
        <FieldRow
          label="image_field"
          handleId="image_field"
          handleColor="#3b82f6"
          onClear={() => updateNodeConfig(id, "image_field", "")}
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