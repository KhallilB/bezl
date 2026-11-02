import { Button, Progress } from "@kb.ui/react";
import { LightIcon } from "./icons";
import {
  type Coverage,
  coverageText,
  lightLabel,
  lineage,
  type Trace,
  type TraceNode,
  traceColumns,
} from "./model";

function NodeButton({
  node,
  pressed,
  onFocus,
}: {
  node: TraceNode;
  pressed?: boolean;
  onFocus: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="journey-node"
      data-light={node.light}
      aria-pressed={pressed}
      onClick={() => onFocus(node.id)}
    >
      <span className="journey-row-icon">
        <LightIcon light={node.light} />
        <span className="journey-sr">{`${lightLabel[node.light]}: `}</span>
      </span>
      <span className="journey-node-title">{node.title}</span>
      <span className="journey-node-meta">{node.meta}</span>
    </button>
  );
}

function CoverageBar({ coverage }: { coverage: Coverage }) {
  const { covered, uncovered, unknown, excluded } = coverage;
  const total = covered + uncovered + unknown + excluded;
  return (
    <div className="journey-coverage">
      <Progress
        label="Run in a test"
        value={total ? Math.round((covered / total) * 100) : 0}
        valueText={`${covered} of ${total} lines`}
      />
      <p>{coverageText(coverage)}</p>
    </div>
  );
}

/** One finding's chain, from the goal to what needs you; starts from the findings. */
export function TraceView({
  trace,
  focus,
  onFocus,
}: {
  trace: Trace;
  focus: string | null;
  onFocus: (id: string | null) => void;
}) {
  const lit = focus ? lineage(trace, focus) : null;
  return (
    <div className="journey-trace">
      {trace.coverage ? <CoverageBar coverage={trace.coverage} /> : null}
      {lit ? (
        <>
          <p className="journey-steer-note">
            How this one connects, from the goal to what needs you.
          </p>
          <ol className="journey-chain" aria-label="How it connects">
            {traceColumns.map((c) => {
              const here = trace.nodes.filter((n) => n.column === c.id && lit.has(n.id));
              return here.length ? (
                <li key={c.id}>
                  <h3 className="page-label">{c.name}</h3>
                  {here.map((n) => (
                    <NodeButton key={n.id} node={n} pressed={n.id === focus} onFocus={onFocus} />
                  ))}
                </li>
              ) : null;
            })}
          </ol>
          <span>
            <Button size="sm" variant="ghost" onClick={() => onFocus(null)}>
              Back to what needs you
            </Button>
          </span>
        </>
      ) : (
        <>
          <p className="journey-steer-note">Pick one to see how it connects.</p>
          <ul className="journey-chain-start" aria-label="What needs you">
            {trace.nodes
              .filter((n) => n.column === "decide")
              .map((n) => (
                <li key={n.id}>
                  <NodeButton node={n} onFocus={onFocus} />
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}
