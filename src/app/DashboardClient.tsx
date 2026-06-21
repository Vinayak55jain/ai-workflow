"use client";

import { useState } from "react";
import WorkflowCard from "@/components/WorkflowCard";
import { deleteWorkflow, renameWorkflow, createWorkflow } from "@/actions/workflow";
import { LayoutGrid, List, Plus } from "lucide-react";

export default function DashboardClient({ initialWorkflows }: { initialWorkflows: any[] }) {
  const [workflows, setWorkflows] = useState(initialWorkflows);

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this workflow?")) {
      await deleteWorkflow(id);
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
    }
  };

  const handleRename = async (id: string) => {
    const currentName = workflows.find((w) => w.id === id)?.name;
    const newName = prompt("Enter new workflow name:", currentName);
    if (newName && newName.trim() && newName !== currentName) {
      await renameWorkflow(id, newName.trim());
      setWorkflows((prev) =>
        prev.map((w) => (w.id === id ? { ...w, name: newName.trim() } : w))
      );
    }
  };

  return (
    <>
      <div className="flex justify-between items-end mb-6">
        <h3 className="text-xl font-bold text-zinc-900">Recent Workflows</h3>
        <div className="flex gap-2">
          <button className="p-2 bg-white border border-zinc-200 rounded-lg text-zinc-600 hover:text-blue-600 transition-colors shadow-sm">
            <LayoutGrid size={18} />
          </button>
          <button className="p-2 bg-white border border-zinc-200 rounded-lg text-zinc-400 hover:text-blue-600 transition-colors shadow-sm">
            <List size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        {workflows.map((wf, idx) => (
          <WorkflowCard
            key={wf.id}
            id={wf.id}
            name={wf.name}
            updatedAt={wf.updatedAt}
            nodeCount={wf._count.nodes}
            status={idx === 1 ? "DRAFT" : "ACTIVE"} // Mocking status for visual variety
            iconType={idx === 0 ? "box" : idx === 1 ? "sparkles" : "languages"} // Mocking icons for variety
            onDelete={handleDelete}
            onRename={handleRename}
          />
        ))}
      </div>

      {/* Stats Cards */}
     
  
      
      {/* Floating Action Button for new workflow (mobile / bottom right) */}
      <div className="fixed bottom-8 right-8">
        <button 
          onClick={async () => {
             const { createWorkflow } = await import("@/actions/workflow");
             await createWorkflow("New Workflow");
          }}
          className="w-14 h-14 bg-blue-700 hover:bg-blue-800 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all"
        >
          <Plus size={28} />
        </button>
      </div>
    </>
  );
}
