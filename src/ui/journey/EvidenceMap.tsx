import {
  Background,
  Controls,
  type Edge,
  Handle,
  type Node,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect } from "react";
import { LightIcon } from "./icons";
import { lightLabel, lineage, planClaim, type Trace, type TraceNode, traceColumns } from "./model";

type Card = Node<{ node: TraceNode }, "card">;
type Head = Node<{ name: string }, "head">;

const across = 250;
const down = 96;

function CardNode({ data }: NodeProps<Card>) {
  const { node } = data;
  return (
    <div className="journey-map-card" data-light={node.light}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <span className="journey-row-icon">
        <LightIcon light={node.light} />
        <span className="journey-sr">{`${lightLabel[node.light]}: `}</span>
      </span>
      <span className="journey-node-title">{node.title}</span>
      <span className="journey-node-meta">{node.meta}</span>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

function HeadNode({ data }: NodeProps<Head>) {
  return <span className="page-label">{data.name}</span>;
}

// Outside the component, so React Flow keeps one set of node types.
const nodeTypes = { card: CardNode, head: HeadNode };

/** Pans to the lit chain whenever it changes. */
function Follow({ chain }: { chain: string }) {
  const flow = useReactFlow();
  useEffect(() => {
    const lit = chain ? chain.split(" ") : [];
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    flow.fitView({
      padding: 0.1,
      duration: still ? 0 : 300,
      ...(lit.length ? { nodes: lit.map((id) => ({ id })) } : {}),
    });
  }, [flow, chain]);
  return null;
}

/** Full-screen evidence: the four columns as a map, the chain from `focus` lit. */
export function EvidenceMap({
  trace,
  focus,
  onFocus,
}: {
  trace: Trace;
  focus: string | null;
  onFocus: (id: string | null) => void;
}) {
  const lit = focus ? lineage(trace, focus) : new Set<string>();
  const heads: Head[] = traceColumns.map((c, i) => ({
    id: `head-${c.id}`,
    type: "head",
    position: { x: i * across, y: -down / 2 },
    data: { name: c.name },
    selectable: false,
    focusable: false,
  }));
  const cards: Card[] = traceColumns.flatMap((c, i) =>
    trace.nodes
      .filter((n) => n.column === c.id)
      .map((node, row) => ({
        id: node.id,
        type: "card",
        position: { x: i * across, y: row * down },
        data: { node },
        selected: node.id === focus,
        className: focus && !lit.has(node.id) ? "journey-map-dim" : "",
      })),
  );
  const edges: Edge[] = trace.links.map((l) => {
    const on = lit.has(l.from) && lit.has(l.to);
    const kind = planClaim(trace, l) ? "journey-map-claim" : "";
    return {
      id: `${l.from}-${l.to}`,
      source: l.from,
      target: l.to,
      className: [kind, focus ? (on ? "journey-map-lit" : "journey-map-dim") : ""].join(" "),
    };
  });
  return (
    <div className="journey-map">
      <ReactFlow
        aria-label="Evidence map"
        nodes={[...heads, ...cards]}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_, n) => {
          if (n.type === "card") onFocus(n.id === focus ? null : n.id);
        }}
        onPaneClick={() => onFocus(null)}
        minZoom={0.4}
        fitView
      >
        <Follow chain={[...lit].sort().join(" ")} />
        <Background gap={24} />
        <Controls showInteractive={false} />
        <Panel position="bottom-center" className="journey-map-key">
          Dotted: the plan says they connect; nothing has checked it. Solid: Bezl checked it.
        </Panel>
      </ReactFlow>
    </div>
  );
}
