import { buildGraph } from "@/lib/dag/buildGraph";
import { hasCycle } from "@/lib/dag/validateCycles";
import { resolveInputs } from "@/lib/dag/resolveInputs";
import { executeNode } from "../execution/nodeRunner";

type NodeStatus = "Pending" | "Running" | "Completed" | "Failed" | "Skipped";

export async function runDAG(
  runId: string,
  nodes: { id: string; type: string; config: any }[],
  edges: { sourceNode: string; targetNode: string; targetHandle: string | null }[],
  scope?: { mode: "full" | "single" | "multi"; nodeIds?: string[] }
) {
  // Defense in depth — never trust client-side validation alone
  if (hasCycle(nodes, edges)) {
    throw new Error("Cannot execute: workflow graph contains a cycle.");
  }

  const { adjacency, parents } = buildGraph(nodes, edges);
  const remaining: Record<string, number> = {};
  nodes.forEach(n => (remaining[n.id] = parents[n.id].length));

  const outputs = new Map<string, any>();
  const statuses = new Map<string, NodeStatus>();
  nodes.forEach(n => statuses.set(n.id, "Pending"));

  // Selective execution: restrict the active node set
  const activeNodeIds = resolveScope(scope, nodes, parents);

  async function markSkipped(nodeId: string) {
    statuses.set(nodeId, "Skipped");
    for (const childId of adjacency[nodeId]) {
      if (activeNodeIds.has(childId) && statuses.get(childId) === "Pending") {
        await markSkipped(childId);
      }
    }
  }

  async function tryExecute(nodeId: string) {
    if (!activeNodeIds.has(nodeId)) {
      console.log(`[dagScheduler] Skipping ${nodeId} — not in activeNodeIds`);
      return;
    }

    const node = nodes.find(n => n.id === nodeId)!;
    const inputs = resolveInputs(nodeId, edges, outputs);

    statuses.set(nodeId, "Running");
    console.log(`[dagScheduler] 🚀 EXECUTING NODE: ${nodeId} (${node.type})`);

    let result;
    try {
      result = await executeNode(node, inputs, runId);
      outputs.set(nodeId, result);
      statuses.set(nodeId, "Completed");
      console.log(`[dagScheduler] ✅ COMPLETED NODE: ${nodeId}`);
    } catch (err) {
      console.log(`[dagScheduler] ❌ FAILED NODE: ${nodeId}`, err);
      statuses.set(nodeId, "Failed");
      // Failure propagation: downstream nodes never unlock — mark them Skipped
      for (const childId of adjacency[nodeId]) {
        if (activeNodeIds.has(childId)) await markSkipped(childId);
      }
      return; // do not continue unlocking children
    }

    // Unlock children whose parents are ALL completed
    const unlocked = adjacency[nodeId].filter(childId => {
      if (!activeNodeIds.has(childId)) {
        console.log(`[dagScheduler]   -> child ${childId} not in active set`);
        return false;
      }
      remaining[childId]--;
      console.log(`[dagScheduler]   -> child ${childId} dependencies remaining: ${remaining[childId]}`);
      return remaining[childId] === 0;
    });

    console.log(`[dagScheduler] Node ${nodeId} unlocked children:`, unlocked);

    // True parallelism — siblings execute concurrently, not sequentially
    await Promise.all(unlocked.map(childId => tryExecute(childId)));
  }

  const roots = nodes
    .filter(n => activeNodeIds.has(n.id) && remaining[n.id] === 0)
    .map(n => n.id);

  console.log(`[dagScheduler] 🏁 STARTING DAG RUN`);
  console.log(`[dagScheduler] Mode: ${scope?.mode ?? "full"}`);
  console.log(`[dagScheduler] Active Nodes:`, Array.from(activeNodeIds));
  console.log(`[dagScheduler] Adjacency:`, adjacency);
  console.log(`[dagScheduler] Initial Remaining:`, remaining);
  console.log(`[dagScheduler] Roots:`, roots);

  await Promise.all(roots.map(id => tryExecute(id)));

  return Object.fromEntries(outputs);
}

function resolveScope(
  scope: { mode: "full" | "single" | "multi"; nodeIds?: string[] } | undefined,
  nodes: { id: string }[],
  parents: Record<string, string[]>
): Set<string> {
  if (!scope || scope.mode === "full") {
    return new Set(nodes.map(n => n.id));
  }
  if (scope.mode === "single") {
    return new Set(scope.nodeIds ?? []);
  }
  // multi: selected nodes + all their ancestors, so dependencies resolve correctly
  const selected = new Set(scope.nodeIds ?? []);
  const result = new Set(selected);
  function addAncestors(nodeId: string) {
    for (const parentId of parents[nodeId] ?? []) {
      if (!result.has(parentId)) {
        result.add(parentId);
        addAncestors(parentId);
      }
    }
  }
  selected.forEach(addAncestors);
  return result;
}
