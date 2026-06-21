import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import WorkflowPageClient from "./WorkflowPageClient";
import "@xyflow/react/dist/style.css";

export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ workflowId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const { workflowId } = await params;

  let workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: { nodes: true, edges: true },
  });

  if (!workflow) {
    // If it's a new workflow, we can create it
    if (workflowId === "new") {
      workflow = await prisma.workflow.create({
        data: {
          name: "Untitled Workflow",
          userId,
        },
        include: { nodes: true, edges: true },
      });
      redirect(`/workflow/${workflow.id}`);
    } else {
      redirect("/");
    }
  }

  // Ensure user owns workflow
  if (workflow.userId !== userId) {
    redirect("/");
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      
<div  className="bg-white width-20px">
  <div className="bg-white rounded-xl shadow-md border border-zinc-200 width-20px px-4 py-2">
    <h1 className="font-semibold text-lg text-black">
      {workflow.name}
    </h1>
  </div>
</div>

  
    {/* Add actions like save, run */}

      <main className="flex-1 w-full bg-zinc-50 dark:bg-zinc-950 flex overflow-hidden">
        <WorkflowPageClient
          workflowId={workflow.id}
          initialNodes={workflow.nodes.map((n) => {
            const raw = (typeof n.config === "object" && n.config !== null && !Array.isArray(n.config))
              ? (n.config as Record<string, unknown>)
              : {};
            // Always wrap in { config: ... } so updateNodeConfig writes to the right place
            // (it does node.data.config[key] = value)
            const data: Record<string, unknown> = raw.config !== undefined
              ? raw          // already in the right shape from a previous save
              : { config: raw };  // fresh from DB — wrap it
            return {
              id: n.id,
              type: n.type,
              position: { x: n.positionX, y: n.positionY },
              data,
            };
          })}
          initialEdges={workflow.edges.map((e) => ({
            id: e.id,
            source: e.sourceNode,
            target: e.targetNode,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
          }))}
        />
      </main>
    </div>
  );
}
