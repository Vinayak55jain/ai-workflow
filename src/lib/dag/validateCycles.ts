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
