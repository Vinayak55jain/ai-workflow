import { BaseEdge, EdgeProps, getBezierPath } from "@xyflow/react";

export default function EdgeAnimated({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: "#a855f7", // purple-500
          strokeWidth: 2,
          strokeDasharray: "5, 5",
          animation: "dash 1s linear infinite",
        }}
        className="react-flow__edge-path animated-edge"
      />
    </>
  );
}
