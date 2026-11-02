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

const buckets: { id: keyof Coverage; word: string }[] = [
  { id: "covered", word: "run" },
  { id: "uncovered", word: "never run" },
  { id: "unknown", word: "can't measure" },
  { id: "excluded", word: "excluded" },
];

function CoverageBar({ coverage }: { coverage: Coverage }) {
  return (
    <div className="journey-coverage">
      <p>{coverageText(coverage)}</p>
      <div className="journey-coverage-bar" aria-hidden="true">
        {buckets
          .filter((b) => coverage[b.id] > 0)
          .map((b) => (
            <span key={b.id} data-bucket={b.id} style={{ flexGrow: coverage[b.id] }} />
          ))}
      </div>
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
            <button type="button" className="journey-link" onClick={() => onFocus(null)}>
              Back to what needs you
            </button>
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
