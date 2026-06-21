"use client";

import { useState } from "react";
import { Plus, Crop, Sparkles } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { useWorkflowStore } from "@/lib/workflowStore";

export default function NodePicker() {
  const [open, setOpen] = useState(false);
  const { screenToFlowPosition } = useReactFlow();
  const addNode = useWorkflowStore((state) => state.addNode);

  const handleAddNode = (type: string, label: string) => {
    // Drop node roughly in the center of the viewport
    const centerPosition = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });

    const newNode = {
      id: crypto.randomUUID(),
      type,
      position: centerPosition,
      data: { label },
    };

    addNode(newNode);
    setOpen(false);
  };

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center">
      {open && (
        <div className="mb-4 bg-white border border-zinc-200 rounded-2xl shadow-xl p-2 flex flex-col gap-2 min-w-[200px] animate-in slide-in-from-bottom-5 fade-in duration-200">
          <button
            onClick={() => handleAddNode("CropImage", "Crop Image")}
            className="flex items-center gap-3 px-4 py-3 hover:bg-orange-50 text-zinc-700 hover:text-orange-700 rounded-xl transition-colors font-semibold text-sm text-left"
          >
            <Crop size={18} />
            Crop Image
          </button>
          <button
            onClick={() => handleAddNode("GeminiModel", "Gemini 3.1 Pro")}
            className="flex items-center gap-3 px-4 py-3 hover:bg-purple-50 text-zinc-700 hover:text-purple-700 rounded-xl transition-colors font-semibold text-sm text-left"
          >
            <Sparkles size={18} />
            Gemini 3.1 Pro
          </button>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className="w-14 h-14 bg-blue-700 hover:bg-blue-800 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all"
      >
        <Plus size={28} className={`transition-transform duration-200 ${open ? "rotate-45" : ""}`} />
      </button>
    </div>
  );
}
