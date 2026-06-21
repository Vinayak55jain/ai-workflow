import { Play, MoreHorizontal } from "lucide-react";
import React from "react";

export type NodeStatus = "IDLE" | "RUNNING" | "COMPLETED" | "FAILED";

interface BaseNodeProps {
  title: string;
  status?: NodeStatus;
  onRun?: () => void;
  children: React.ReactNode;
  selected?: boolean;
}

export default function BaseNode({
  title,
  status = "IDLE",
  onRun,
  children,
  selected = false,
}: BaseNodeProps) {
  const isRunning = status === "RUNNING";

  return (
    <div
      className={`bg-white rounded-2xl w-[320px] transition-all relative ${
        selected ? "ring-2 ring-blue-500 shadow-lg" : "border border-zinc-200 shadow-sm"
      }`}
      style={{
        animation: isRunning ? "pulse-glow 2s infinite" : "none",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-100">
        <h3 className="font-bold text-sm text-zinc-800">{title}</h3>
        
        <div className="flex items-center gap-2">
          {/* Status Badge */}
          {status !== "IDLE" && (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                status === "RUNNING"
                  ? "bg-purple-100 text-purple-700"
                  : status === "COMPLETED"
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {status}
            </span>
          )}

          {/* Action Buttons */}
          <button
            onClick={onRun}
            className="flex items-center gap-1 bg-green-50 hover:bg-green-100 text-green-600 px-2 py-1 rounded-md transition-colors"
          >
            <Play size={12} fill="currentColor" />
            <span className="text-[10px] font-bold">Run</span>
          </button>
          
          <button className="text-zinc-400 hover:text-zinc-600 transition-colors">
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {children}
      </div>
    </div>
  );
}
