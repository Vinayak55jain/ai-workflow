"use client";

import { useState } from "react";
import { Node, Edge } from "@xyflow/react";
import WorkflowCanvas from "./WorkflowCanvas";
import HistorySidebar from "@/components/workflow/HistorySidebar";

interface WorkflowPageClientProps {
  workflowId: string;
  initialNodes: Node[];
  initialEdges: Edge[];
}

export default function WorkflowPageClient({
  workflowId,
  initialNodes,
  initialEdges,
}: WorkflowPageClientProps) {
  const [refreshToken, setRefreshToken] = useState<number>(0);

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 min-w-0">
        <WorkflowCanvas
          workflowId={workflowId}
          initialNodes={initialNodes}
          initialEdges={initialEdges}
          onRunStart={() => setRefreshToken((t) => t + 1)}
        />
      </div>
      <div className="w-72 border-l border-zinc-200 bg-white shrink-0 overflow-y-auto">
        <HistorySidebar workflowId={workflowId} refreshToken={refreshToken} />
      </div>
    </div>
  );
}
