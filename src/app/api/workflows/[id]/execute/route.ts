import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { runDAG } from "@/server/scheduler/dagScheduler";
import { auth } from "@trigger.dev/sdk/v3";

const ExecuteSchema = z.object({
  mode: z.enum(["full", "single", "multi"]),
  nodeIds: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  console.log("🔵 [API] /execute hit for workflow:", id);

  const body = await req.json();
  console.log("🔵 [API] Request body:", body);

  const parsed = ExecuteSchema.safeParse(body);
  if (!parsed.success) {
    console.log("🔴 [API] Validation failed:", parsed.error.flatten());
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const workflow = await prisma.workflow.findUnique({
    where: { id },
    include: { nodes: true, edges: true },
  });

  if (!workflow) {
    console.log("🔴 [API] Workflow not found:", id);
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  console.log("🔵 [API] Found workflow with", workflow.nodes.length, "nodes,", workflow.edges.length, "edges");

  const run = await prisma.workflowRun.create({
    data: { workflowId: workflow.id, status: "Running" },
  });

  console.log("🔵 [API] Created run:", run.id, "— calling runDAG now");

  let publicToken: string | undefined;
  try {
  console.log(`🔵 [executeNode] Starting node execution`);
    publicToken = await auth.createPublicToken({
      scopes: {
        read: {
          runs: [run.id],
        },
      },
    });
  } catch (error: any) {
    console.error("Failed to create public token (is TRIGGER_SECRET_KEY set?):", error.message);
  }

  // Fire and don't block the HTTP response on full completion —
  // client tracks progress via the History sidebar / Realtime subscription.
  runDAG(run.id, workflow.nodes, workflow.edges, {
    mode: parsed.data.mode,
    nodeIds: parsed.data.nodeIds,
  })
    .then(() => {
      console.log("✅ [API] runDAG completed for run:", run.id);
      return prisma.workflowRun.update({
        where: { id: run.id },
        data: { status: "Completed", finishedAt: new Date() },
      });
    })
    .catch((err) => {
      console.error("🔴 [API] runDAG threw an error:", err);
      return prisma.workflowRun.update({
        where: { id: run.id },
        data: { status: "Failed", finishedAt: new Date() },
      });
    });

  return NextResponse.json({ runId: run.id, publicToken });
}
