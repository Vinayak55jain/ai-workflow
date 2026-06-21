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
