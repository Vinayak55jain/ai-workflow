"use client";

import { useEffect, useCallback } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  BackgroundVariant,
  Node,
  Edge,
  ReactFlowProvider,
  Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useWorkflowStore } from "@/lib/workflowStore";
import { saveWorkflow } from "@/actions/workflow";
import EdgeAnimated from "@/components/workflow/EdgeAnimated";
import RequestInputNode from "@/components/workflow/nodes/RequestInputsNode";
import ResponseNode from "@/components/workflow/nodes/ResponseNode";
import CropImageNode from "@/components/workflow/nodes/CropImageNode";
import GeminiNode from "@/components/workflow/nodes/GeminiNode";
import NodePicker from "@/components/workflow/NodePicker";
import CanvasToolbar from "@/components/workflow/CanvasToolbar";
import { hasCycle } from "@/lib/dag/validateCycles";
import { HANDLE_TYPES } from "@/lib/dag/handleTypes";

const nodeTypes = {
  RequestInput: RequestInputNode,
  Response: ResponseNode,
  CropImage: CropImageNode,
  GeminiModel: GeminiNode,
};

const edgeTypes = {
  animated: EdgeAnimated,
};

interface WorkflowCanvasProps {
  workflowId: string;
  initialNodes: Node[];
  initialEdges: Edge[];
  onRunStart?: () => void;
}

function CanvasContent({ workflowId, initialNodes, initialEdges, onRunStart }: WorkflowCanvasProps) {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setNodes,
    setEdges,
    undo,
    redo,
    takeSnapshot,
  } = useWorkflowStore();

  // Initialize store with server data
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    takeSnapshot();
  }, [initialNodes, initialEdges, setNodes, setEdges, takeSnapshot]);

  // Keyboard shortcuts for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  // Auto-save logic
  useEffect(() => {
    // Only attempt auto-save if nodes match expected initialized state
    const timer = setTimeout(() => {
      saveWorkflow(workflowId, nodes, edges).catch(console.error);
    }, 1000);
    return () => clearTimeout(timer);
  }, [nodes, edges, workflowId]);

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      // Reject immediately if either handle is missing — this is the core fix
      if (!connection.sourceHandle || !connection.targetHandle) {
        return false;
      }

      const targetAlreadyConnected = edges.some(
        (edge) =>
          edge.target === connection.target &&
          edge.targetHandle === connection.targetHandle
      );
      if (targetAlreadyConnected) return false;

      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return false;

      const sourceType = HANDLE_TYPES[sourceNode.type!]?.[connection.sourceHandle!];
      const targetType = HANDLE_TYPES[targetNode.type!]?.[connection.targetHandle!];
      if (!sourceType || !targetType) return false;

      // Strict type match — no coercion
      if (sourceType !== targetType) return false;

      // Structural rules
      if (targetNode.type === "RequestInput") return false; // pure source, never a target
      if (sourceNode.type === "Response") return false;       // pure sink, never a source

      const simulatedEdges = [
        ...edges.map(e => ({ sourceNode: e.source, targetNode: e.target })),
        {
          sourceNode: connection.source!,
          targetNode: connection.target!,
        }
      ];
      if (hasCycle(nodes, simulatedEdges)) return false;

      return true;
    },
    [nodes, edges]
  );



  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: "animated" }}
        fitView
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color="#d1d5db"
          style={{ backgroundColor: "#ffffff" }}
        />
        <Controls />
        <MiniMap zoomable pannable className="rounded-xl overflow-hidden shadow-lg border border-zinc-200" />
        
        <CanvasToolbar workflowId={workflowId} onRunStart={onRunStart} />
      </ReactFlow>

      <NodePicker />
    </div>
  );
}

export default function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasContent {...props} />
    </ReactFlowProvider>
  );
}
