import { Edge, Node } from "@xyflow/react";

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
    return { value: (node?.data?.config as any)?.[handleId] ?? "", isConnected: false };
  }

  // Connected — recursively resolve from the source field
  // (source could itself be a passthrough field, e.g. chained text fields)
  const sourceNode = nodes.find((n) => n.id === incomingEdge.source);
  const sourceValue = (sourceNode?.data?.config as any)?.[incomingEdge.sourceHandle!] ?? "";

  return { value: sourceValue, isConnected: true };
}
