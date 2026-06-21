"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const CreateWorkflowSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name is too long"),
});

export async function createWorkflow(name: string) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const validated = CreateWorkflowSchema.parse({ name });

  const workflowId = crypto.randomUUID();

  // Create workflow record first
  await prisma.workflow.create({
    data: { id: workflowId, userId, name: validated.name },
  });

  // Seed only RequestInput + Response — user wires everything else manually
  await prisma.workflowNode.createMany({
    data: [
      { id: crypto.randomUUID(), workflowId, type: "RequestInput", positionX: 100, positionY: 250, config: {} },
      { id: crypto.randomUUID(), workflowId, type: "Response",     positionX: 700, positionY: 250, config: {} },
    ],
  });
  // No edges — user connects nodes manually

  redirect(`/workflow/${workflowId}`);
}

export async function listWorkflows() {
  const { userId } = await auth();
  if (!userId) return [];

  return await prisma.workflow.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { nodes: true } } },
  });
}

export async function renameWorkflow(id: string, name: string) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const validated = CreateWorkflowSchema.parse({ name });

  await prisma.workflow.updateMany({
    where: { id, userId },
    data: { name: validated.name },
  });

  revalidatePath("/");
}

export async function deleteWorkflow(id: string) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  await prisma.workflow.deleteMany({ where: { id, userId } });
  revalidatePath("/");
}

export async function saveWorkflow(id: string, nodes: any[], edges: any[]) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const workflow = await prisma.workflow.findUnique({ where: { id, userId } });
  if (!workflow) throw new Error("Workflow not found");

  // Sequential deletes then inserts — avoids interactive transaction which
  // PgBouncer (Neon pooler) does not support.
  await prisma.workflowNode.deleteMany({ where: { workflowId: id } });
  await prisma.workflowEdge.deleteMany({ where: { workflowId: id } });

  if (nodes.length > 0) {
    const uniqueNodes = Array.from(
      new Map(nodes.map(n => [n.id, n])).values()
    );

    await prisma.workflowNode.createMany({
      data: uniqueNodes.map((n) => ({
        id: n.id,
        workflowId: id,
        type: n.type || "RequestInput",
        positionX: n.position?.x ?? 0,
        positionY: n.position?.y ?? 0,
        // data.config is where updateNodeConfig writes all user edits.
        // Fall back chain: data.config → data (legacy) → empty object
        config: (n.data?.config ?? n.data) || {},
      })),
      skipDuplicates: true,
    });
  }

  if (edges.length > 0) {
    const uniqueEdges = Array.from(
      new Map(edges.map(e => [e.id, e])).values()
    );

    await prisma.workflowEdge.createMany({
      data: uniqueEdges.map((e) => ({
        id: e.id,
        workflowId: id,
        sourceNode: e.source,
        targetNode: e.target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null,
      })),
      skipDuplicates: true,
    });
  }

  return { success: true };
}
