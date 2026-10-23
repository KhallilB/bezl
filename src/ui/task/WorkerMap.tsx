import { layoutWorkerMap } from "./geometry";
import { accessLabel, type TaskView, type WorkerView } from "./model";
import { useSvgId } from "./svgId";
import { useReducedMotion } from "./useReducedMotion";

export function describe(task: TaskView, workers: WorkerView[]): string {
  const parts = workers.map((w) => `${w.name} ${accessLabel[w.role]}, ${w.state}`);
  return `Task ${task.branch}: ${parts.join("; ")}`;
}

export function WorkerMap({ task, workers }: { task: TaskView; workers: WorkerView[] }) {
  const reduced = useReducedMotion();
  const id = useSvgId();
  const { width, height, hub, rx, ry, nodes } = layoutWorkerMap(task, workers);
  const write = `${id}-write`;
  const edgeId = (workerId: string) => `${id}-edge-${workerId}`;
  return (
    <svg
      className="task-worker-map"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={describe(task, workers)}
    >
      <defs>
        {/* User space: a level edge has a zero-height box, which disables bounding-box gradients. */}
        <linearGradient
          id={write}
          gradientUnits="userSpaceOnUse"
          x1={hub.x}
          y1={hub.y}
          x2={hub.x + rx}
          y2={hub.y}
        >
          <stop offset="0" className="task-write-from" />
          <stop offset="1" className="task-write-to" />
        </linearGradient>
      </defs>
      {[0.55, 1, 1.45].map((k) => (
        <ellipse key={k} className="task-ring" cx={hub.x} cy={hub.y} rx={rx * k} ry={ry * k} />
      ))}
      {nodes.map((n) => (
        <path
          key={`edge-${n.id}`}
          id={edgeId(n.id)}
          className="task-edge"
          d={n.edge}
          data-edge={n.id}
          data-access={n.access}
          data-state={n.worker.state}
          style={
            n.access === "write" && n.worker.state !== "blocked"
              ? { stroke: `url(#${write})` }
              : undefined
          }
        />
      ))}
      {nodes.map((n) => {
        const lx = n.side === "start" ? n.x + 26 : n.x - 26;
        return (
          <g key={n.id} className="task-node" data-node={n.id} data-state={n.worker.state}>
            <circle className="task-node-pool" cx={n.x} cy={n.y} r={34} />
            <circle className="task-node-ring" cx={n.x} cy={n.y} r={15} />
            <circle className="task-node-core" cx={n.x} cy={n.y} r={5} />
            <text className="task-node-name" x={lx} y={n.y - 2} textAnchor={n.side}>
              {n.worker.name}
            </text>
            <text className="task-node-meta" x={lx} y={n.y + 15} textAnchor={n.side}>
              {`${accessLabel[n.worker.role]} · ${n.worker.state}`}
            </text>
          </g>
        );
      })}
      <g data-hub>
        <rect className="task-hub" x={hub.x - 110} y={hub.y - 24} width={220} height={48} rx={24} />
        <text className="task-hub-name" x={hub.x} y={hub.y - 2} textAnchor="middle">
          {task.branch}
        </text>
        <text className="task-hub-meta" x={hub.x} y={hub.y + 14} textAnchor="middle">
          task worktree
        </text>
      </g>
      {reduced
        ? null
        : nodes
            .filter((n) => n.access === "write" && n.worker.state === "running")
            .map((n) => (
              <circle key={`packet-${n.id}`} className="task-packet" r={3} data-packet>
                <animateMotion dur="1.8s" repeatCount="indefinite">
                  <mpath href={`#${edgeId(n.id)}`} />
                </animateMotion>
              </circle>
            ))}
    </svg>
  );
}
