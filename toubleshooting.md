# TROUBLESHOOTING.md — Image Handle & Trigger.dev Execution Issues

This document fixes three issues found during end-to-end testing:

1. ❌ `image_field` on Request-Inputs has no visible connection dot/handle
2. ❌ Clicking "Run" does not trigger any Trigger.dev tasks
3. ❓ Unclear where to monitor task execution

---

## Issue 1: Missing `image_field` Handle on Request-Inputs Node

### Diagnosis

"No visible dot at all" means the `<Handle>` JSX element for `image_field` either:
- Doesn't exist in the component at all, or
- Exists but is not actually being rendered (conditional logic hiding it), or
- Is rendered with `opacity: 0` / `display: none` by mistake, or
- Is missing the required `id` prop, which can cause React Flow to silently fail to register it

### Fix — Full Corrected `RequestInputsNode.tsx`

Replace your current file with this. Pay close attention to the **two `<Handle>` elements** at the bottom of each field — these were likely missing or malformed.

```tsx
// src/components/nodes/RequestInputsNode.tsx
"use client";

import { Handle, Position, NodeProps } from "reactflow";
import { useWorkflowStore } from "@/store/workflowStore";

type RequestInputsData = {
  config: {
    text_field?: string;
    image_field?: string; // stores image URL or base64
  };
};

export function RequestInputsNode({ id, data }: NodeProps<RequestInputsData>) {
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);

  const textValue = data.config?.text_field ?? "";
  const imageValue = data.config?.image_field ?? "";

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm w-72 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm">Request-Inputs</span>
      </div>

      {/* TEXT FIELD ROW */}
      <div className="relative mb-3">
        <label className="text-xs text-gray-500 mb-1 block">text_field</label>
        <textarea
          value={textValue}
          onChange={(e) => updateNodeConfig(id, "text_field", e.target.value)}
          className="w-full text-xs border rounded p-2 resize-none"
          rows={3}
        />
        {/* ✅ THIS HANDLE MUST EXIST — output, type=text */}
        <Handle
          type="source"
          id="text_field"
          position={Position.Right}
          style={{
            background: "#f97316", // orange dot, matches screenshot
            width: 10,
            height: 10,
            top: "50%",
          }}
        />
      </div>

      {/* IMAGE FIELD ROW */}
      <div className="relative">
        <label className="text-xs text-gray-500 mb-1 block">image_field</label>
        <label className="w-full text-xs border rounded p-2 flex items-center justify-center gap-1 cursor-pointer bg-gray-50 hover:bg-gray-100">
          <span>📤 Upload Image</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                updateNodeConfig(id, "image_field", reader.result as string);
              };
              reader.readAsDataURL(file);
            }}
          />
        </label>

        {/* 🔴 THIS WAS LIKELY MISSING — output, type=image */}
        <Handle
          type="source"
          id="image_field"
          position={Position.Right}
          style={{
            background: "#3b82f6", // blue dot, matches screenshot
            width: 10,
            height: 10,
            top: "50%",
          }}
        />
      </div>
    </div>
  );
}
```

### Checklist to confirm the fix worked

- [ ] Open the node on canvas — you should now see **two colored dots** on the right edge: orange (text) near the top, blue (image) near the bottom.
- [ ] Hover over the blue dot — cursor should change to crosshair.
- [ ] Drag from the blue dot toward a Crop Image node's `image_in` handle — a connection line should draw and snap on drop.

### If the dot still doesn't appear after this fix

Check these in order:

1. **Is `RequestInputsNode` actually registered in your `nodeTypes` map?**
   ```tsx
   // WorkflowCanvas.tsx
   const nodeTypes = {
     requestInputs: RequestInputsNode, // ← confirm this exact key matches node.type in your DB/state
     cropImage: CropImageNode,
     gemini: GeminiNode,
     response: ResponseNode,
   };
   ```
   If the key doesn't match exactly what's stored as `node.type`, React Flow falls back to a default node renderer — which would explain a missing custom handle silently.

2. **Is the parent node wrapper applying `overflow: hidden`?** If a parent `div` has `overflow-hidden` and the handle is positioned with `right: -5px` (intentionally hanging off the edge), it can get visually clipped. Check your global node wrapper CSS.

3. **React Flow version mismatch** — confirm `reactflow` package version is consistent across your `package.json` (no duplicate versions in `package-lock.json`). Run:
   ```bash
   npm ls reactflow
   ```
   If you see more than one version listed, run `npm dedupe` and restart your dev server.

---

## Issue 2: Trigger.dev Tasks Not Firing on "Run" Click

### Diagnosis

This is almost always one of these four breaks in the chain:

```
Run button → POST /execute → API route → runDAG → executeNode → tasks.triggerAndPoll()
     ↑              ↑              ↑           ↑          ↑
   Break A       Break B        Break C     Break D    Break E
```

### Step-by-step fix

#### Break A — Is your local Trigger.dev runtime even running?

You confirmed you're "not sure" if `npx trigger.dev@latest dev` is running. **This is very likely your root cause.**

**Fix:** Open a dedicated terminal and run:

```bash
npx trigger.dev@latest dev
```

Leave this terminal open and running for your entire testing session. You should see:

```
Trigger.dev (4.4.6)
------------------------------------------------------
Tasks:
  crop-image
  gemini-generate

Waiting for tasks...
```

> **Why this matters:** In local development, Trigger.dev's cloud servers receive your trigger request, but the actual task *code* only runs on your machine via this CLI process. If it's not running, your task gets queued on Trigger.dev's servers and **never executes** — no error is thrown on your end, it just silently sits there. This explains "nothing happens" perfectly.

#### Break B — Is the Run button actually wired to call the API?

Full corrected `CanvasToolbar.tsx`:

```tsx
// src/components/canvas/CanvasToolbar.tsx
"use client";

import { useState } from "react";
import { useWorkflowStore } from "@/store/workflowStore";
import { useParams } from "next/navigation";

type ExecutionMode = "full" | "single" | "multi";

export function CanvasToolbar() {
  const params = useParams();
  const workflowId = params.workflowId as string;

  const selectedNodeIds = useWorkflowStore((s) => s.selectedNodeIds);
  const [mode, setMode] = useState<ExecutionMode>("full");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setError(null);
    setIsRunning(true);

    try {
      const res = await fetch(`/api/workflows/${workflowId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          nodeIds: mode !== "full" ? selectedNodeIds : undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? `Request failed: ${res.status}`);
      }

      const { runId, publicToken } = await res.json();
      console.log("✅ Run started:", runId);

      // Store these so nodes can subscribe via useRealtimeRun
      useWorkflowStore.getState().setActiveRun(runId, publicToken);
    } catch (err: any) {
      console.error("🔴 Run failed:", err);
      setError(err.message);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b bg-white sticky top-0 z-10">
      <div className="flex gap-1 bg-gray-100 rounded p-0.5">
        {(["full", "single", "multi"] as ExecutionMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`text-xs px-2 py-1 rounded ${
              mode === m ? "bg-white shadow font-medium" : "text-gray-500"
            }`}
          >
            {m[0].toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      <button
        onClick={handleRun}
        disabled={isRunning || (mode !== "full" && selectedNodeIds.length === 0)}
        className="bg-green-600 text-white text-sm px-3 py-1.5 rounded disabled:opacity-50"
      >
        {isRunning ? "Running..." : "▶ Run"}
      </button>

      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
```

**Verify:** Open browser DevTools → Network tab → click Run → confirm a `POST /api/workflows/.../execute` request appears. If it doesn't appear at all, this file wasn't wired correctly before — confirm it now matches the above.

#### Break C — Is the API route actually calling `runDAG`?

Add temporary debug logs to confirm the chain is reached. In `src/app/api/workflows/[id]/execute/route.ts`:

```ts
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  console.log("🔵 [API] /execute hit for workflow:", params.id);

  const body = await req.json();
  console.log("🔵 [API] Request body:", body);

  const parsed = ExecuteSchema.safeParse(body);
  if (!parsed.success) {
    console.log("🔴 [API] Validation failed:", parsed.error.flatten());
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const workflow = await prisma.workflow.findUnique({
    where: { id: params.id },
    include: { nodes: true, edges: true },
  });

  if (!workflow) {
    console.log("🔴 [API] Workflow not found:", params.id);
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  console.log("🔵 [API] Found workflow with", workflow.nodes.length, "nodes,", workflow.edges.length, "edges");

  const run = await prisma.workflowRun.create({
    data: { workflowId: workflow.id, status: "Running" },
  });

  console.log("🔵 [API] Created run:", run.id, "— calling runDAG now");

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

  return NextResponse.json({ runId: run.id });
}
```

**Check your `npm run dev` terminal** (not the browser console) for these logs after clicking Run. Server-side `console.log` only appears in the terminal running Next.js, never the browser.

- If you see `🔵 [API] Found workflow with 0 nodes, 0 edges` → your workflow wasn't saved correctly before running (Phase 5 persistence issue, not Phase 7).
- If `runDAG` throws immediately → likely a cycle-validation false-positive, or `roots` array is empty because every node incorrectly shows `inDegree > 0`.

#### Break D — Is `executeNode` reached?

Add the same style of log inside `src/server/execution/nodeRunner.ts`:

```ts
export async function executeNode(node, inputs, runId) {
  console.log("🔵 [executeNode] Starting node:", node.type, node.id);
  // ...
}
```

If this never logs, but `runDAG` started — your `roots` calculation or `tryExecute` call is broken. Double check this part of `dagScheduler.ts`:

```ts
const roots = nodes
  .filter(n => activeNodeIds.has(n.id) && remaining[n.id] === 0)
  .map(n => n.id);

console.log("🔵 [runDAG] Root nodes to start:", roots); // ADD THIS

await Promise.all(roots.map(id => tryExecute(id)));
```

If `roots` logs as an **empty array**, every node thinks it has at least one parent — meaning your `buildGraph` in-degree calculation isn't matching your actual edges. Most common cause: edges saved to DB have `sourceNode`/`targetNode` as `null` or mismatched IDs (a Phase 5 persistence bug surfacing here).

#### Break E — Is `tasks.triggerAndPoll()` actually being called and succeeding?

```ts
case "cropImage": {
  console.log("🔵 [nodeRunner] Triggering crop-image task with payload:", {
    imageUrl: inputs["image-input"],
    x: node.config.x,
  });

  const result = await tasks.triggerAndPoll<typeof cropImageTask>("crop-image", {
    imageUrl,
    x: node.config.x,
    y: node.config.y,
    width: node.config.width,
    height: node.config.height,
    nodeExecutionId: nodeExecution.id,
  });

  console.log("✅ [nodeRunner] crop-image task result:", result.status);
  // ...
}
```

If this throws an auth/connection error, it's almost always:
- `TRIGGER_SECRET_KEY` missing or wrong in `.env.local` (restart `npm run dev` after editing env files — Next.js does not hot-reload them)
- Your local `trigger.dev dev` process not running (back to Break A)

---

## Issue 3: Where to Monitor Trigger.dev Task Execution

### Primary — Your terminal running `npx trigger.dev@latest dev`

This is real-time and the fastest place to watch during development:

```
Trigger.dev (4.4.6)
------------------------------------------------------
⚡ crop-image     RUNNING    run_a1b2c3
   Starting crop image task for https://...
⚡ crop-image     COMPLETED  run_a1b2c3   (30.4s)
```

If you see **nothing at all** here when you click Run, that confirms the request either never reached Trigger.dev, or this terminal isn't running (Break A above).

### Secondary — Trigger.dev Web Dashboard

1. Go to your Trigger.dev dashboard (same one from initial setup — `cloud.trigger.dev` or self-hosted URL)
2. Select your project (`proj_nujmxtobrchnctaenunc`)
3. Click **Runs** in the left sidebar
4. Every triggered task appears here, with full payload, logs, output, duration, and status — even after the run finishes, unlike the terminal which scrolls away

Use the dashboard when you need to inspect **exact payload sent** or **exact output returned**, since it's persistent and searchable. Use the terminal for live, real-time feedback while testing.

---

## Quick Reference — Full Testing Checklist (Run Every Time)

```
□ Terminal 1: npm run dev                    — running?
□ Terminal 2: npx trigger.dev@latest dev     — running?
□ .env.local has TRIGGER_SECRET_KEY set      — confirmed?
□ .env.local has GEMINI_API_KEY set          — confirmed?
□ Restarted both terminals after any .env.local edit?
□ Browser DevTools → Network tab open while testing?
□ Browser DevTools → Console tab open for client errors?
□ Terminal 1 console for server-side [API]/[executeNode] logs?
□ Terminal 2 / Trigger.dev dashboard for task execution logs?
```

---

## Summary Table

| Symptom | Root Cause | Fix Location |
|---|---|---|
| No image_field dot visible | Missing/malformed `<Handle>` JSX | `RequestInputsNode.tsx` (§1) |
| Run button does nothing | `trigger.dev dev` not running | Terminal 2 (§2, Break A) |
| Run button does nothing | Button not calling fetch | `CanvasToolbar.tsx` (§2, Break B) |
| API returns 404/400 | Workflow not saved / bad payload | Check Phase 5 persistence |
| `runDAG` never starts nodes | Empty `roots` array — bad edge data | `buildGraph.ts` / DB edges |
| Task triggers but errors | Missing `TRIGGER_SECRET_KEY` | `.env.local` + restart server |
| Can't see what ran | Looking in wrong place | Terminal 2 + Trigger.dev dashboard (§3) |