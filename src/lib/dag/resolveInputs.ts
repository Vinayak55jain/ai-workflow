export function resolveInputs(
  nodeId: string,
  edges: { sourceNode: string; targetNode: string; targetHandle: string | null }[],
  outputs: Map<string, any>
): Record<string, any> {
  // All edges whose target is this node
  const incomingEdges = edges.filter(e => e.targetNode === nodeId);

  console.log(`[resolveInputs] node=${nodeId.slice(0, 8)}…`);
  console.log(`  total edges in graph : ${edges.length}`);
  console.log(`  incoming edges found : ${incomingEdges.length}`);

  if (incomingEdges.length === 0 && edges.length > 0) {
    // Sanity-check: log every edge's targetNode vs this nodeId so we can
    // spot mismatches (e.g. React Flow "target" vs DB "targetNode" mix-up)
    console.warn(`  ⚠️  No incoming edges matched. Checking edge field names…`);
    const sample = edges[0] as Record<string, unknown>;
    const fields = Object.keys(sample);
    console.warn(`  Edge keys available : ${fields.join(", ")}`);
    if (!fields.includes("targetNode")) {
      console.error(
        `  ❌ Edges are missing "targetNode" field! They have: ${fields.join(", ")}`,
        "\n  This means saveWorkflow saved edges with React Flow field names",
        "(source/target) instead of DB field names (sourceNode/targetNode)."
      );
    } else {
      // targetNode field exists but nothing matched — log all targets for comparison
      const allTargets = edges.map(e => e.targetNode);
      console.warn(`  Edge targetNode values : ${allTargets.map(t => t.slice(0, 8) + "…").join(", ")}`);
      console.warn(`  Looking for nodeId     : ${nodeId.slice(0, 8)}…`);
    }
  }

  const inputs: Record<string, any> = {};

  for (const edge of incomingEdges) {
    const parentOutput = outputs.get(edge.sourceNode);
    const handleKey = edge.targetHandle ?? "default";

    if (parentOutput === undefined) {
      // Parent hasn't produced output yet — this shouldn't happen if the DAG
      // scheduler calls nodes in dependency order, but log it so we can catch it.
      console.warn(
        `  ⚠️  Parent ${edge.sourceNode.slice(0, 8)}… has no output yet`,
        `(handle: ${handleKey}) — skipping this edge`
      );
      continue;
    }

    console.log(
      `  ✅ handle="${handleKey}" ← parent ${edge.sourceNode.slice(0, 8)}…`,
      `value type: ${typeof parentOutput}`
    );
    inputs[handleKey] = parentOutput;
  }

  return inputs;
}
