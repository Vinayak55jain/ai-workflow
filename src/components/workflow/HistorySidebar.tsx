"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import RunCard from "./RunCard";

interface HistorySidebarProps {
  workflowId: string;
  refreshToken: number; // incremented by parent when a new run starts
}

export default function HistorySidebar({ workflowId, refreshToken }: HistorySidebarProps) {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workflowId) return;

    setLoading(true);
    setError(null);

    fetch(`/api/workflows/${workflowId}/runs`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load runs (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        setRuns(data);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load runs");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [workflowId, refreshToken]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-200">
        <h2 className="text-sm font-bold text-zinc-700">Execution History</h2>
      </div>

      <div className="overflow-y-auto flex-1 divide-y divide-zinc-100">
        {loading ? (
          <div className="flex items-center justify-center h-full py-8">
            <Loader2 className="animate-spin text-zinc-400" size={20} />
          </div>
        ) : error ? (
          <p className="text-red-500 text-xs p-4">{error}</p>
        ) : runs.length === 0 ? (
          <p className="text-zinc-400 text-xs p-4 text-center">No runs yet</p>
        ) : (
          runs.map((run) => <RunCard key={run.id} run={run} />)
        )}
      </div>
    </div>
  );
}
