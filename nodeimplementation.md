# Node Field Behavior & Type System — Implementation Plan

This plan covers three related UI/connection behaviors observed in the reference screenshot (Magica/Galaxy.ai workflow canvas):

1. **Live value sync** — when a field is connected via an edge, the downstream field shows the upstream value live and becomes read-only.
2. **Strict typed handles** — every input/output handle has an explicit data type (`text` | `image` | `video` | `audio` | `file` | `number`), and connections are only valid between matching types.
3. **Crop node sliders** — X/Y/Width/Height become live slider+number combo fields that can ALSO act as connectable inputs (manual by default, but accept an incoming `number` edge).

> **Status:** Ready to build — all open questions resolved.

---

## 1. Resolved Type System (Source of Truth)

This table is now the single authority for every handle in the app. All four node types, fully enumerated:

| Node | Handle ID | Direction | Type |
|---|---|---|---|
| Request-Inputs | `text_field` | output | `text` |
| Request-Inputs | `image_field` | output | `image` |
| Crop Image | `image_in` | input | `image` |
| Crop Image | `x_position` | input (optional) | `number` |
| Crop Image | `y_position` | input (optional) | `number` |
| Crop Image | `width` | input (optional) | `number` |
| Crop Image | `height` | input (optional) | `number` |
| Crop Image | `image_out` | output | `image` |
| Gemini | `prompt` | input | `text` |
| Gemini | `system_prompt` | input | `text` |
| Gemini | `image` | input (optional) | `image` |
| Gemini | `video` | input (optional) | `video` |
| Gemini | `audio` | input (optional) | `audio` |
| Gemini | `file` | input (optional) | `file` |
| Gemini | `response` | output | `text` |
| Response | `input` | input | `text` |

**Rule:** a connection is valid **if and only if** `sourceHandle.type === targetHandle.type`. No exceptions, no implicit coercion (e.g. `image_out` can never connect to `prompt`, even though both are "data").

**Additional structural rules (already true from Phase 4, restated for completeness):**
- Request-Inputs has **no input handles** — it is a pure source. It can never be a connection target.
- Response has **no output handles** — it is a pure sink. It can never be a connection source.
- A node's own output handle can connect to another node's input handle only — self-loops are already blocked by the cycle validator (Phase 7).

---

## 2. Live Value Sync + Read-Only Greyed State

### Behavior

When an edge connects `sourceHandle` → `targetHandle`:
- The target field becomes **read-only** (cannot type into it).
- The target field's displayed value **live-updates** to mirror the source field's current value — not just at connection time, but continuously as the source changes (e.g. user edits Request-Inputs' `text_field`, the Gemini `Prompt` field updates instantly).
- Visually greyed out (background `bg-gray-100`, text `text-gray-500`, cursor `not-allowed`) — same visual language already established in Phase 4 for "connected input" handles.
- If the edge is deleted, the field reverts to **editable**, and keeps the last-synced value as a normal editable starting point (does not clear).

### Why this needs a new data flow (not just UI)

Right now (post-Phase 4), node `config` values are independent per node — each node stores its own field values in isolation. Live sync requires a **derived value layer**: a field's *displayed* value is either (a) its own stored config value, if unconnected, or (b) the live value of whatever upstream field it's wired to, if connected.

### Implementation

**[NEW] `src/lib/dag/resolveLiveValue.ts`**

Pure function, shared between canvas rendering and any future preview logic:

```ts
import { Edge, Node } from "reactflow";

export function resolveLiveValue(
  nodeId: string,
  handleId: string,
  nodes: Node[],
  edges: Edge[]
): { value: any; isConnected: boolean } {
  const incomingEdge = edges.find(
    (e) => e.target === nodeId && e.targetHandle === handleId
  );

  if (!incomingEdge) {
    // Not connected — use this node's own stored config value
    const node = nodes.find((n) => n.id === nodeId);
    return { value: node?.data?.config?.[handleId] ?? "", isConnected: false };
  }

  // Connected — recursively resolve from the source field
  // (source could itself be a passthrough field, e.g. chained text fields)
  const sourceNode = nodes.find((n) => n.id === incomingEdge.source);
  const sourceValue = sourceNode?.data?.config?.[incomingEdge.sourceHandle!] ?? "";

  return { value: sourceValue, isConnected: true };
}
```

> Note: this is a **shallow one-hop resolution** for now — it reads the immediate source node's stored config directly, not a full upstream execution result. That's correct for this use case, because this sync is a *design-time canvas preview*, not the actual DAG execution output. Execution-time values still flow through `resolveInputs.ts` from Phase 7 — these are two separate systems serving two separate purposes (canvas editing UX vs. actual run-time data passing).

**[MODIFY] Each node component** (`GeminiNode.tsx`, `CropImageNode.tsx`, `ResponseNode.tsx`)

Pattern to apply to every connectable field:

```tsx
import { useStore } from "reactflow";
import { resolveLiveValue } from "@/lib/dag/resolveLiveValue";

function PromptField({ nodeId }: { nodeId: string }) {
  const nodes = useStore((s) => s.getNodes());
  const edges = useStore((s) => s.edges);

  const { value, isConnected } = resolveLiveValue(nodeId, "prompt", nodes, edges);

  return (
    <textarea
      value={value}
      readOnly={isConnected}
      disabled={isConnected}
      placeholder={isConnected ? undefined : "Enter your prompt..."}
      onChange={(e) => {
        if (isConnected) return; // safety guard, UI already prevents this
        updateNodeConfig(nodeId, "prompt", e.target.value);
      }}
      className={
        isConnected
          ? "bg-gray-100 text-gray-500 cursor-not-allowed"
          : "bg-white text-gray-900"
      }
    />
  );
}
```

This same pattern applies to: Gemini's `prompt`, `system_prompt`; Crop's `x_position`, `y_position`, `width`, `height` (combined with the slider, see §3); Response's `input` (read-only display, since Response never accepts manual typing anyway).

---

## 3. Crop Image Node — Slider Fields with Optional Connection

### Behavior (from screenshot)

Each of X Position / Y Position / Width / Height shows:
- A **small colored connection dot** (handle) on the left — same as any other input
- A **slider** in the middle
- A **live numeric readout** on the right showing current %
- A **small reset icon** to restore default

These four fields are **manual by default** (slider-driven), but per your confirmation, they **can optionally receive an incoming edge** from any `number`-typed output elsewhere in the graph.

### Implementation

**[MODIFY] `src/components/nodes/CropImageNode.tsx`**

```tsx
import { Handle, Position, useStore } from "reactflow";
import { resolveLiveValue } from "@/lib/dag/resolveLiveValue";

function SliderField({
  nodeId,
  handleId,
  label,
  min = 0,
  max = 100,
}: {
  nodeId: string;
  handleId: string;
  label: string;
  min?: number;
  max?: number;
}) {
  const nodes = useStore((s) => s.getNodes());
  const edges = useStore((s) => s.edges);
  const { value, isConnected } = resolveLiveValue(nodeId, handleId, nodes, edges);

  return (
    <div className="flex items-center gap-2 relative">
      <Handle
        type="target"
        id={handleId}
        position={Position.Left}
        className="!w-2.5 !h-2.5"
        style={{ background: isConnected ? "#555" : "#ec4899" }} // pink dot per screenshot
        isConnectable={!isConnected}
      />
      <span className="text-xs text-gray-500 w-24">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value || 0}
        disabled={isConnected}
        onChange={(e) =>
          !isConnected && updateNodeConfig(nodeId, handleId, Number(e.target.value))
        }
        className={isConnected ? "opacity-50 cursor-not-allowed" : ""}
      />
      <span className="text-xs w-8 text-right">{value || 0}</span>
      <button
        onClick={() => !isConnected && updateNodeConfig(nodeId, handleId, defaultFor(handleId))}
        disabled={isConnected}
        title="Reset"
      >
        ↺
      </button>
    </div>
  );
}

// Usage inside CropImageNode body:
<SliderField nodeId={id} handleId="x_position" label="X Position (%)" />
<SliderField nodeId={id} handleId="y_position" label="Y Position (%)" />
<SliderField nodeId={id} handleId="width"       label="Width (%)" />
<SliderField nodeId={id} handleId="height"      label="Height (%)" />
```

### Type registration for the new `number` type

Update the type-matching map (from §1) wherever `isValidConnection` is implemented:

```ts
// src/lib/dag/handleTypes.ts  (NEW — single source of truth, replaces ad-hoc arrays from Phase 4)
export const HANDLE_TYPES: Record<string, Record<string, "text" | "image" | "video" | "audio" | "file" | "number">> = {
  requestInputs: { text_field: "text", image_field: "image" },
  cropImage: {
    image_in: "image",
    x_position: "number",
    y_position: "number",
    width: "number",
    height: "number",
    image_out: "image",
  },
  gemini: {
    prompt: "text",
    system_prompt: "text",
    image: "image",
    video: "video",
    audio: "audio",
    file: "file",
    response: "text",
  },
  response: { input: "text" },
};
```

**[MODIFY] `WorkflowCanvas.tsx` → `isValidConnection`**

Replace the Phase 4 ad-hoc array checks with a lookup against this single map:

```ts
import { HANDLE_TYPES } from "@/lib/dag/handleTypes";

const isValidConnection = useCallback((connection: Connection) => {
  const sourceNode = nodes.find((n) => n.id === connection.source);
  const targetNode = nodes.find((n) => n.id === connection.target);
  if (!sourceNode || !targetNode) return false;

  const sourceType = HANDLE_TYPES[sourceNode.type!]?.[connection.sourceHandle!];
  const targetType = HANDLE_TYPES[targetNode.type!]?.[connection.targetHandle!];
  if (!sourceType || !targetType) return false;

  // Strict type match — no coercion
  if (sourceType !== targetType) return false;

  // Structural rules
  if (targetNode.type === "requestInputs") return false; // pure source, never a target
  if (sourceNode.type === "response") return false;       // pure sink, never a source

  // Cycle check (from Phase 7)
  const simulatedEdges = [...edges, { sourceNode: connection.source!, targetNode: connection.target! }];
  if (hasCycle(nodes, simulatedEdges)) return false;

  return true;
}, [nodes, edges]);
```

This single map replaces and consolidates the scattered `imageOutputs`/`textOutputs` arrays from the earlier Phase 4 implementation — one file, one source of truth, used by both the connection validator and the live-sync resolver.

---

## 4. Updated Node Field Reference (Final Spec)

### Request-Inputs
```
Fields (no incoming connections possible):
- text_field   → output handle, type: text
- image_field  → output handle, type: image
```

### Crop Image
```
Fields:
- image_in     → input handle,  type: image   (required)
- x_position   → input handle,  type: number  (optional; manual slider OR connected)
- y_position   → input handle,  type: number  (optional; manual slider OR connected)
- width        → input handle,  type: number  (optional; manual slider OR connected)
- height       → input handle,  type: number  (optional; manual slider OR connected)
- image_out    → output handle, type: image
```

### Gemini 3.1 Pro
```
Fields:
- prompt         → input handle,  type: text   (required)
- system_prompt  → input handle,  type: text   (optional)
- image          → input handle,  type: image  (optional, vision)
- video          → input handle,  type: video  (optional)
- audio          → input handle,  type: audio  (optional)
- file           → input handle,  type: file   (optional)
- response       → output handle, type: text
```

### Response
```
Fields:
- input  → input handle, type: text (read-only display only, no manual typing ever)
```

---

## 5. Files Summary

```
[NEW]    src/lib/dag/handleTypes.ts         — single source of truth for all handle types
[NEW]    src/lib/dag/resolveLiveValue.ts    — derives live/read-only field values for canvas UI
[MODIFY] src/components/nodes/RequestInputsNode.tsx
[MODIFY] src/components/nodes/CropImageNode.tsx     — add SliderField, wire to handleTypes
[MODIFY] src/components/nodes/GeminiNode.tsx        — apply live-sync pattern to prompt/system_prompt
[MODIFY] src/components/nodes/ResponseNode.tsx      — read-only live display
[MODIFY] src/app/workflow/[workflowId]/WorkflowCanvas.tsx — isValidConnection now reads from handleTypes.ts
```

---

## 6. Verification Plan

### Manual
1. Connect Request-Inputs `text_field` → Gemini `prompt`. Confirm the Gemini Prompt field greys out, becomes uneditable, and shows the exact text from Request-Inputs.
2. Edit the Request-Inputs text field. Confirm the connected Gemini Prompt field updates **live**, without needing to re-save or refresh.
3. Delete that edge. Confirm the Gemini Prompt field becomes editable again and retains the last synced value (not blanked).
4. Attempt `image_field` → `prompt` (image → text). Confirm connection is rejected at drag time.
5. Attempt `response` → `image_in` (text → image). Confirm rejected.
6. Connect a `number`-typed output (if one exists elsewhere in your graph, e.g. a future "Number" utility node) → Crop's `width` handle. Confirm the slider greys out and reflects the connected value live.
7. Confirm Request-Inputs never shows an input handle anywhere on the node (pure source), and Response never shows an output handle (pure sink).
8. Confirm all five rejected-connection examples from your spec are blocked: `image_field → prompt`, `response → image`, `image_out → input(text)`.