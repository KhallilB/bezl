import { tracePaths } from "./geometry";
import { useSvgId } from "./svgId";

/** Decorative output-rate trace; the status chip and text carry the meaning. */
export function ActivityTrace({ samples }: { samples: number[] }) {
  const id = useSvgId();
  const paths = tracePaths(samples);
  if (!paths) return null;
  const fill = `${id}-fill`;
  return (
    <svg
      className="task-trace"
      data-part="trace"
      viewBox={`0 0 ${paths.width} ${paths.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="task-trace-from" />
          <stop offset="1" className="task-trace-to" />
        </linearGradient>
      </defs>
      <path className="task-trace-fill" d={paths.area} fill={`url(#${fill})`} />
      <path className="task-trace-line" d={paths.line} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
