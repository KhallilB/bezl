import { accessLabel, type TaskView, type WorkerView } from "./model";
import { useReducedMotion } from "./useReducedMotion";

const W = 1000;
const H = 240;
const HUB = { x: W / 2, y: H / 2 };
const RX = 300;
const RY = 82;

type Placed = { worker: WorkerView; x: number; y: number; side: "start" | "end"; edge: string };

/** Primary sits on the right of the hub, reviewers fan out on the left. */
function place(workers: WorkerView[]): Placed[] {
  const reviewers = workers.filter((w) => w.role === "reviewer");
  const primaries = workers.filter((w) => w.role === "primary");
  const angle = (i: number, n: number, from: number, to: number) =>
    n === 1 ? (from + to) / 2 : from + ((to - from) * i) / (n - 1);
  const at = (worker: WorkerView, deg: number): Placed => {
    const rad = (deg * Math.PI) / 180;
    const x = HUB.x + RX * Math.cos(rad);
    const y = HUB.y + RY * Math.sin(rad);
    const lift = Math.min(y, HUB.y) - 70;
    return {
      worker,
      x,
      y,
      side: x >= HUB.x ? "start" : "end",
      edge: `M ${HUB.x} ${HUB.y} Q ${(HUB.x + x) / 2} ${lift} ${x} ${y}`,
    };
  };
  return [
    ...primaries.map((w, i) => at(w, angle(i, primaries.length, -18, 18))),
    ...reviewers.map((w, i) => at(w, angle(i, reviewers.length, 205, 155))),
  ];
}

export function describe(task: TaskView, workers: WorkerView[]): string {
  const parts = workers.map((w) => `${w.name} ${accessLabel[w.role]}, ${w.state}`);
  return `Task ${task.branch}: ${parts.join("; ")}`;
}

export function WorkerMap({ task, workers }: { task: TaskView; workers: WorkerView[] }) {
  const reduced = useReducedMotion();
  const placed = place(workers);
  return (
    <svg
      className="task-worker-map"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={describe(task, workers)}
    >
      <defs>
        <radialGradient id="task-map-pool">
          <stop offset="0" className="task-pool-in" />
          <stop offset="1" className="task-pool-out" />
        </radialGradient>
        <linearGradient id="task-map-write" x1="0" x2="1">
          <stop offset="0" className="task-write-from" />
          <stop offset="1" className="task-write-to" />
        </linearGradient>
      </defs>
      {[0.55, 1, 1.45].map((k) => (
        <ellipse key={k} className="task-ring" cx={HUB.x} cy={HUB.y} rx={RX * k} ry={RY * k} />
      ))}
      {placed.map(({ worker, edge }) => (
        <path
          key={`edge-${worker.id}`}
          id={`task-edge-${worker.id}`}
          className="task-edge"
          d={edge}
          data-edge={worker.id}
          data-access={worker.role === "primary" ? "write" : "read"}
          data-state={worker.state}
        />
      ))}
      {placed.map(({ worker, x, y, side }) => (
        <g key={worker.id} className="task-node" data-node={worker.id} data-state={worker.state}>
          <circle className="task-node-pool" cx={x} cy={y} r={64} fill="url(#task-map-pool)" />
          <circle className="task-node-ring" cx={x} cy={y} r={15} />
          <circle className="task-node-core" cx={x} cy={y} r={5} />
          <text
            className="task-node-name"
            x={side === "start" ? x + 26 : x - 26}
            y={y - 2}
            textAnchor={side}
          >
            {worker.name}
          </text>
          <text
            className="task-node-meta"
            x={side === "start" ? x + 26 : x - 26}
            y={y + 15}
            textAnchor={side}
          >
            {`${accessLabel[worker.role]} · ${worker.state}`}
          </text>
        </g>
      ))}
      <g data-hub>
        <rect className="task-hub" x={HUB.x - 110} y={HUB.y - 24} width={220} height={48} rx={24} />
        <text className="task-hub-name" x={HUB.x} y={HUB.y - 2} textAnchor="middle">
          {task.branch}
        </text>
        <text className="task-hub-meta" x={HUB.x} y={HUB.y + 14} textAnchor="middle">
          task worktree
        </text>
      </g>
      {reduced
        ? null
        : placed
            .filter(({ worker }) => worker.role === "primary" && worker.state === "running")
            .map(({ worker }) => (
              <circle key={`packet-${worker.id}`} className="task-packet" r={3} data-packet>
                <animateMotion dur="1.8s" repeatCount="indefinite">
                  <mpath href={`#task-edge-${worker.id}`} />
                </animateMotion>
              </circle>
            ))}
    </svg>
  );
}
