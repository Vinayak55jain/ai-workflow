"use client";

import { Pencil, Trash2, Box, Sparkles, Languages } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

export interface WorkflowCardProps {
  id: string;
  name: string;
  updatedAt: Date;
  nodeCount: number;
  status: "ACTIVE" | "DRAFT";
  iconType?: "sparkles" | "box" | "languages";
  onDelete: (id: string) => void;
  onRename: (id: string) => void;
}

export default function WorkflowCard({
  id,
  name,
  updatedAt,
  nodeCount,
  status,
  iconType = "box",
  onDelete,
  onRename,
}: WorkflowCardProps) {
  
  const getIcon = () => {
    switch(iconType) {
      case "sparkles": return <Sparkles size={24} className="text-purple-600" />;
      case "languages": return <Languages size={24} className="text-blue-600" />;
      default: return <Box size={24} className="text-orange-600" />;
    }
  };

  const getIconBg = () => {
    switch(iconType) {
      case "sparkles": return "bg-purple-100";
      case "languages": return "bg-blue-100";
      default: return "bg-orange-100";
    }
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start mb-4">
          <div className={`p-3 rounded-xl ${getIconBg()}`}>
            {getIcon()}
          </div>
          <div className={`px-2.5 py-1 rounded-md text-xs font-bold ${
            status === "ACTIVE" 
              ? "bg-green-100 text-green-700" 
              : "bg-zinc-100 text-zinc-600"
          }`}>
            {status}
          </div>
        </div>
        
        <Link href={`/workflow/${id}`}>
          <h3 className="font-bold text-lg text-zinc-900 mb-1 hover:text-blue-600 transition-colors">
            {name}
          </h3>
        </Link>
        <p suppressHydrationWarning className="text-sm text-zinc-500 font-medium">
          Last edited {formatDistanceToNow(updatedAt, { addSuffix: true })}
        </p>
      </div>

      <div className="mt-8 flex justify-between items-center pt-4 border-t border-zinc-100">
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] text-blue-700 font-bold border-2 border-white z-10">M</div>
            <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-[10px] text-green-700 font-bold border-2 border-white z-0">S</div>
          </div>
          <span className="text-xs text-zinc-500 font-semibold">{nodeCount} nodes</span>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={() => onRename(id)}
            className="p-2 rounded-lg bg-zinc-50 text-zinc-500 hover:bg-blue-50 hover:text-blue-600 transition-colors"
          >
            <Pencil size={16} />
          </button>
          <button 
            onClick={() => onDelete(id)}
            className="p-2 rounded-lg bg-zinc-50 text-zinc-500 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
