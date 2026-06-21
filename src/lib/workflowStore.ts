import { create } from "zustand";
import {
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from "@xyflow/react";

export type Snapshot = {
  nodes: Node[];
  edges: Edge[];
};

export type WorkflowState = {
  nodes: Node[];
  edges: Edge[];
  past: Snapshot[];
  future: Snapshot[];

  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange<Node>[]) => void;
  onEdgesChange: (changes: EdgeChange<Edge>[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (node: Node) => void;
  updateNodeConfig: (nodeId: string, key: string, value: any) => void;

  takeSnapshot: () => void;
  undo: () => void;
  redo: () => void;

  activeRunId: string | null;
  activeRunToken: string | undefined;
  setActiveRun: (runId: string | null, token?: string) => void;

  // Per-node execution status driven by polling — key is nodeId
  nodeStatuses: Record<string, "Running" | "Completed" | "Failed">;
  setNodeStatus: (nodeId: string, status: "Running" | "Completed" | "Failed") => void;
  clearNodeStatuses: () => void;
};

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  past: [],
  future: [],
  activeRunId: null,
  activeRunToken: undefined,
  nodeStatuses: {},

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setActiveRun: (runId, token) => set({ activeRunId: runId, activeRunToken: token }),
  setNodeStatus: (nodeId, status) =>
    set((state) => ({ nodeStatuses: { ...state.nodeStatuses, [nodeId]: status } })),
  clearNodeStatuses: () => set({ nodeStatuses: {} }),

  takeSnapshot: () => {
    const { nodes, edges, past } = get();
    // Only save snapshot if there are actual changes or it's the first
    // We limit past to last 50 states to save memory
    const newPast = [...past, { nodes, edges }].slice(-50);
    set({ past: newPast, future: [] });
  },

  onNodesChange: (changes) => {
    // Only snapshot on significant changes like position finish or add/remove,
    // but React Flow sends many position changes while dragging.
    // To simplify, we snapshot only if it's a structural change or dragging ends.
    const isSignificant = changes.some(
      (c) => c.type === "remove" || c.type === "add" || (c.type === "position" && !c.dragging)
    );
    if (isSignificant) get().takeSnapshot();

    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
  },

  onEdgesChange: (changes) => {
    const isSignificant = changes.some((c) => c.type === "remove" || c.type === "add");
    if (isSignificant) get().takeSnapshot();

    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },

  onConnect: (connection) => {
    get().takeSnapshot();
    set({
      // Ensure all edges use our custom 'animated' edge type
      edges: addEdge({ ...connection, type: "animated" }, get().edges),
    });
  },

  addNode: (node) => {
    get().takeSnapshot();
    set({
      nodes: [...get().nodes, node],
    });
  },

  updateNodeConfig: (nodeId, key, value) => {
    set({
      nodes: get().nodes.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              config: {
                ...((node.data?.config as object) || {}),
                [key]: value,
              },
            },
          };
        }
        return node;
      }),
    });
  },

  undo: () => {
    const { past, future, nodes, edges } = get();
    if (past.length === 0) return;

    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);

    set({
      nodes: previous.nodes,
      edges: previous.edges,
      past: newPast,
      future: [{ nodes, edges }, ...future],
    });
  },

  redo: () => {
    const { past, future, nodes, edges } = get();
    if (future.length === 0) return;

    const next = future[0];
    const newFuture = future.slice(1);

    set({
      nodes: next.nodes,
      edges: next.edges,
      past: [...past, { nodes, edges }],
      future: newFuture,
    });
  },
}));
