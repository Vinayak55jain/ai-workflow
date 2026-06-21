# Phase 7 — DAG Execution Engine Implementation Plan (Revised)

This plan details the implementation of the core DAG execution engine, shared cycle validation, handle-aware input resolution, failure propagation, and the selective execution modes toolbar.

> **Status:** Approved revision — incorporates fixes for input merging, failure propagation, shared client/server validation, and explicit API/polling decisions.

---

## Resolved Decisions (formerly Open Questions)

| # | Question | Decision |
|---|---|---|
| 1 | `CanvasToolbar` placement | **Sticky top bar**, full-width, above the React Flow canvas. Bottom is reserved for the existing `+` node picker. |
| 2 | API route for execution | New route: `POST /api/workflows/[id]/execute` → invokes `runDAG` server-side, returns `{ runId }` immediately (does not block on completion). |
| 3 | Polling vs webhooks for task status | Neither manual polling nor raw webhooks. Use **Trigger.dev's `triggerAndPoll()`** (v3 SDK) inside `nodeRunner.ts` to await task completion. Client subscribes separately via Trigger.dev Realtime hooks for live UI updates. |

---

## Proposed Changes

### Shared DAG Logic (Client + Server)

**[NEW] `src/lib/dag/buildGraph.ts`**
Pure function. Builds adjacency list, in-degree map, and parent map from `nodes` + `edges`. No I/O, no server-only imports — must be importable from both client components and server code.

```ts
export type Graph = {
  adjacency: Record<string, string[]>;
  inDegree: Record<string, number>;
  parents: Record<string, string[]>;
};

export function buildGraph(nodes: { id: string }[], edges: { sourceNode: string; targetNode: string }[]): Graph {
  const adjacency: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};
  const parents: Record<string, string[]> = {};

  nodes.forEach(n => {
    adjacency[n.id] = [];
    inDegree[n.id] = 0;
    parents[n.id] = [];
  });

  edges.forEach(e => {
    adjacency[e.sourceNode].push(e.targetNode);
    inDegree[e.targetNode]++;
    parents[e.targetNode].push(e.sourceNode);
  });

  return { adjacency, inDegree, parents };
}
```

**[NEW] `src/lib/dag/validateCycles.ts`**
Pure function. Implements Kahn's Algorithm. Imports `buildGraph`. Used by:
- `WorkflowCanvas.tsx` → `isValidConnection` (client-side, real-time, on every drag)
- `dagScheduler.ts` → pre-execution guard (server-side, defense in depth — never trust the client alone)

```ts
import { buildGraph } from "./buildGraph";

export function hasCycle(
  nodes: { id: string }[],
  edges: { sourceNode: string; targetNode: string }[]
): boolean {
  const { inDegree, adjacency } = buildGraph(nodes, edges);
  const remaining = { ...inDegree };
  const queue = nodes.filter(n => remaining[n.id] === 0).map(n => n.id);
  let processed = 0;

  while (queue.length) {
    const nodeId = queue.shift()!;
    processed++;
    for (const child of adjacency[nodeId]) {
      remaining[child]--;
      if (remaining[child] === 0) queue.push(child);
    }
  }

  return processed !== nodes.length;
}
```

**[NEW] `src/lib/dag/resolveInputs.ts`**
Pure function. Resolves a node's inputs **keyed by target handle**, not flattened by node. Prevents silent overwrites when a node has multiple parents (e.g. Final Gemini receiving from both Crop1 and Crop2).

```ts
export function resolveInputs(
  nodeId: string,
  edges: { sourceNode: string; targetNode: string; targetHandle: string | null }[],
  outputs: Map<string, any>
): Record<string, any> {
  const incomingEdges = edges.filter(e => e.targetNode === nodeId);
  const inputs: Record<string, any> = {};

  for (const edge of incomingEdges) {
    const parentOutput = outputs.get(edge.sourceNode);
    const handleKey = edge.targetHandle ?? "default";
    inputs[handleKey] = parentOutput;
  }

  return inputs;
}
```

> ⚠️ Each `Handle` in your node components (`CropImageNode`, `GeminiNode`, `ResponseNode`) must have a **unique, stable `id`** (e.g. `"image-input-a"`, `"image-input-b"`) when a node accepts multiple same-type inputs. Reuse the handle IDs already established in Phase 4's type-safe connection work.

---

### Core DAG Engine (Server-only)

**[NEW] `src/server/scheduler/dagScheduler.ts`**

```ts
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
    if (!activeNodeIds.has(nodeId)) return;

    const node = nodes.find(n => n.id === nodeId)!;
    const inputs = resolveInputs(nodeId, edges, outputs);

    statuses.set(nodeId, "Running");

    let result;
    try {
      result = await executeNode(node, inputs, runId);
      outputs.set(nodeId, result);
      statuses.set(nodeId, "Completed");
    } catch (err) {
      statuses.set(nodeId, "Failed");
      // Failure propagation: downstream nodes never unlock — mark them Skipped
      for (const childId of adjacency[nodeId]) {
        if (activeNodeIds.has(childId)) await markSkipped(childId);
      }
      return; // do not continue unlocking children
    }

    // Unlock children whose parents are ALL completed
    const unlocked = adjacency[nodeId].filter(childId => {
      if (!activeNodeIds.has(childId)) return false;
      remaining[childId]--;
      return remaining[childId] === 0;
    });

    // True parallelism — siblings execute concurrently, not sequentially
    await Promise.all(unlocked.map(childId => tryExecute(childId)));
  }

  const roots = nodes
    .filter(n => activeNodeIds.has(n.id) && remaining[n.id] === 0)
    .map(n => n.id);

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
```

**[NEW] `src/server/execution/nodeRunner.ts`**

```ts
import { tasks } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/prisma";
import type { cropImageTask } from "@/trigger/cropImage";
import type { geminiTask } from "@/trigger/geminiGenerate";

export async function executeNode(
  node: { id: string; type: string; config: any },
  inputs: Record<string, any>,
  runId: string
) {
  const nodeExecution = await prisma.runNodeExecution.create({
    data: { runId, nodeId: node.id, status: "Running", input: inputs },
  });

  switch (node.type) {
    case "requestInputs": {
      // Passthrough — no Trigger.dev task, data source only
      await prisma.runNodeExecution.update({
        where: { id: nodeExecution.id },
        data: { status: "Completed", output: node.config, finishedAt: new Date() },
      });
      return node.config;
    }

    case "cropImage": {
      const imageUrl = inputs["image-input"]?.croppedImageUrl ?? inputs["image-input"]?.image_field;
      const result = await tasks.triggerAndPoll<typeof cropImageTask>("crop-image", {
        imageUrl,
        x: node.config.x,
        y: node.config.y,
        width: node.config.width,
        height: node.config.height,
        nodeExecutionId: nodeExecution.id,
      });

      if (result.status !== "COMPLETED") {
        await prisma.runNodeExecution.update({
          where: { id: nodeExecution.id },
          data: { status: "Failed", finishedAt: new Date() },
        });
        throw new Error(`Crop task failed for node ${node.id}`);
      }
      return result.output;
    }

    case "gemini": {
      const promptInput = inputs["prompt-input"];
      const imageInput = inputs["image-input"];

      const result = await tasks.triggerAndPoll<typeof geminiTask>("gemini-generate", {
        prompt: resolveTemplate(node.config.prompt, promptInput),
        systemPrompt: node.config.systemPrompt,
        imageBase64: imageInput?.croppedImageUrl,
        nodeExecutionId: nodeExecution.id,
      });

      if (result.status !== "COMPLETED") {
        await prisma.runNodeExecution.update({
          where: { id: nodeExecution.id },
          data: { status: "Failed", finishedAt: new Date() },
        });
        throw new Error(`Gemini task failed for node ${node.id}`);
      }
      return result.output;
    }

    case "response": {
      // Passthrough — collects final output, no execution
      await prisma.runNodeExecution.update({
        where: { id: nodeExecution.id },
        data: { status: "Completed", output: inputs, finishedAt: new Date() },
      });
      return inputs;
    }

    default:
      throw new Error(`Unknown node type: ${node.type}`);
  }
}

function resolveTemplate(template: string, value: any): string {
  // Replaces {{response}} style placeholders with upstream output text
  if (!value) return template;
  const text = typeof value === "string" ? value : value.response ?? JSON.stringify(value);
  return template.replace(/\{\{.*?\}\}/g, text);
}
```

> **Note on `triggerAndPoll`:** this blocks the server-side call until the Trigger.dev task finishes, which is exactly the "wait for parent before unlocking children" behavior the scheduler needs. No custom polling loop, no webhook handler required for this phase.

---

### API Route

**[NEW] `src/app/api/workflows/[id]/execute/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { runDAG } from "@/server/scheduler/dagScheduler";

const ExecuteSchema = z.object({
  mode: z.enum(["full", "single", "multi"]),
  nodeIds: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const parsed = ExecuteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const workflow = await prisma.workflow.findUnique({
    where: { id: params.id },
    include: { nodes: true, edges: true },
  });
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  const run = await prisma.workflowRun.create({
    data: { workflowId: workflow.id, status: "Running" },
  });

  // Fire and don't block the HTTP response on full completion —
  // client tracks progress via the History sidebar / Realtime subscription.
  runDAG(run.id, workflow.nodes, workflow.edges, {
    mode: parsed.data.mode,
    nodeIds: parsed.data.nodeIds,
  })
    .then(() =>
      prisma.workflowRun.update({
        where: { id: run.id },
        data: { status: "Completed", finishedAt: new Date() },
      })
    )
    .catch(() =>
      prisma.workflowRun.update({
        where: { id: run.id },
        data: { status: "Failed", finishedAt: new Date() },
      })
    );

  return NextResponse.json({ runId: run.id });
}
```

---

### Client Integration

**[MODIFY] `src/app/workflow/[workflowId]/WorkflowCanvas.tsx`**
Update `isValidConnection` to import `hasCycle` from `src/lib/dag/validateCycles.ts` (shared logic, not duplicated). Simulate the proposed edge addition before allowing the connection:

```ts
import { hasCycle } from "@/lib/dag/validateCycles";

const isValidConnection = useCallback((connection: Connection) => {
  // ...existing type-safety + greyed-out-handle checks from Phase 4...

  const simulatedEdges = [...edges, {
    sourceNode: connection.source!,
    targetNode: connection.target!,
  }];
  if (hasCycle(nodes, simulatedEdges)) return false;

  return true;
}, [nodes, edges]);
```

**[NEW] `src/components/canvas/CanvasToolbar.tsx`**
Sticky top bar. Exposes:
- Run mode selector: `Full` | `Single` | `Multi` (segmented control)
- "Run" button — disabled if `mode === "single"` and no node selected, or `mode === "multi"` and fewer than 1 node selected
- Save, Undo, Redo, Export, Import (already partially built)

On click, calls:
```ts
POST /api/workflows/[id]/execute
Body: { mode, nodeIds: selectedNodeIds }
```
Receives `{ runId }` → passes to `HistorySidebar` to begin live tracking (Realtime subscription, built in Phase 8).

**[MODIFY] `src/components/nodes/BaseNode.tsx`**
Add selection-aware styling (highlighted border when selected) and a small "▶ Run from here" affordance on hover/right-click, which sets `mode: "single"` and `nodeIds: [node.id]` in the toolbar state. No execution logic lives in the node component itself — it only sets selection state.

---

## Database Schema Update Required

Add `"Skipped"` to the status values used in `RunNodeExecution.status` and `WorkflowRun.status` (currently only `Pending | Running | Completed | Failed` per the original plan). This is required for the failure-propagation behavior above — children of a failed node must be visibly distinguishable from children that simply never ran.

No Prisma schema change needed (status is a `String`, not an enum) — just document the new value and handle it in the UI's status badge component.

---

## Verification Plan

### Automated
- `npm run build` — type checking across `lib/dag`, `server/scheduler`, `server/execution`, and the new API route.

### Manual
1. **Cycle blocking:** attempt `A → B → C → A` in the UI. Connection must be rejected at drag-time (client) — confirm no network request is even made.
2. **Parallel start:** trigger a "full" run on the sample workflow. Confirm via Trigger.dev dashboard logs that Crop1, Crop2, and Gemini1 all start within the same second — not sequentially.
3. **Dependency unlock:** confirm Final Gemini does not start until **both** Crop1 and Crop2 report `Completed` (check `RunNodeExecution.startedAt` timestamps in DB).
4. **Fan-in correctness:** confirm Final Gemini's stored `input` JSON contains **both** Crop1's and Crop2's output, not just one (this directly tests the `resolveInputs` fix).
5. **Failure propagation:** manually force one node to throw (e.g. invalid Gemini prompt config). Confirm downstream nodes are marked `Skipped`, not `Pending` forever, and the Response node never receives output.
6. **Single mode:** select one node, run "single." Confirm only that node executes and its parents are not re-triggered.
7. **Multi mode:** select two non-adjacent nodes, run "multi." Confirm their shared ancestors execute first, then both selected nodes run in parallel once unlocked.

---

## Files Summary

```
[NEW]    src/lib/dag/buildGraph.ts
[NEW]    src/lib/dag/validateCycles.ts
[NEW]    src/lib/dag/resolveInputs.ts
[NEW]    src/server/scheduler/dagScheduler.ts
[NEW]    src/server/execution/nodeRunner.ts
[NEW]    src/app/api/workflows/[id]/execute/route.ts
[NEW]    src/components/canvas/CanvasToolbar.tsx
[MODIFY] src/app/workflow/[workflowId]/WorkflowCanvas.tsx
[MODIFY] src/components/nodes/BaseNode.tsx
```