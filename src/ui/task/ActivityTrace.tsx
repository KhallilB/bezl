const W = 600;
const H = 64;

/** Decorative output-rate trace; the status chip and text carry the meaning. */
export function ActivityTrace({ samples }: { samples: number[] }) {
  if (samples.length < 2) return null;
  const max = Math.max(...samples, 1);
  const pts = samples.map((v, i) => {
    const x = (i / (samples.length - 1)) * W;
    const y = H - 6 - (v / max) * (H - 14);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const line = `M ${pts.join(" L ")}`;
  return (
    <svg
      className="task-trace"
      data-part="trace"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="task-trace-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="task-trace-from" />
          <stop offset="1" className="task-trace-to" />
        </linearGradient>
      </defs>
      <path
        className="task-trace-fill"
        d={`${line} L ${W} ${H} L 0 ${H} Z`}
        fill="url(#task-trace-fill)"
      />
      <path className="task-trace-line" d={line} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
