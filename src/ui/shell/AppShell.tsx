import { Button } from "@kb.ui/react";
import type { ReactNode } from "react";
import { LightIcon } from "../journey/icons";
import {
  type JourneyTask,
  type Light,
  lightLabel,
  type ProviderUsage,
  taskLight,
} from "../journey/model";
import "./page.css";
import "./shell.css";

export type AgentState = "checking" | "ready" | "fix";
export type AgentStatus = { name: string; state: AgentState };

const agentLight: Record<AgentState, Light> = {
  checking: "working",
  ready: "done",
  fix: "needsYou",
};
const agentWord: Record<AgentState, string> = {
  checking: "Checking",
  ready: "Ready",
  fix: "Needs a fix",
};

export type AppShellProps = {
  tasks: JourneyTask[];
  usage: ProviderUsage[];
  /** The background agent check, one row each; a click opens Coding agents. */
  agents?: AgentStatus[];
  onAgents?: () => void;
  currentTaskId?: string;
  onOpenTask: (taskId: string) => void;
  /** Shows New task above the list when given. */
  onNewTask?: () => void;
  /** Shows Approvals, with how many items wait on you, when given. */
  approvals?: { count: number; current: boolean; onOpen: () => void };
  children: ReactNode;
};

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 3.25v9.5M3.25 8h9.5" strokeLinecap="round" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2.75 9.25h3l1 1.5h2.5l1-1.5h3" strokeLinejoin="round" />
      <path d="M4.25 3.25h7.5l1.5 6v3.5h-10.5v-3.5z" strokeLinejoin="round" />
    </svg>
  );
}

/** The task list before the first task: one action. */
export function EmptyTasks({ onNewTask }: { onNewTask: () => void }) {
  return (
    <section className="shell-empty page" aria-labelledby="shell-empty-title">
      <header className="page-header">
        <h1 id="shell-empty-title" className="page-title">
          No tasks yet
        </h1>
      </header>
      <div>
        <Button variant="secondary" onClick={onNewTask}>
          <PlusIcon />
          New task
        </Button>
      </div>
    </section>
  );
}

// Usage earns sidebar space only near an agent's limit.
const NEAR_LIMIT = 80;

/** Narrow, the lists are one scrolling row; centres the open row in it. */
function keepInView(row: HTMLElement | null) {
  const bar = row?.closest<HTMLElement>(".shell-lists");
  if (!row || !bar || bar.scrollWidth <= bar.clientWidth) return;
  bar.scrollLeft = row.offsetLeft - bar.offsetLeft - (bar.clientWidth - row.offsetWidth) / 2;
}

/** Sidebar of every task, each with its light, beside the open task. */
export function AppShell({
  tasks,
  usage,
  agents = [],
  onAgents,
  currentTaskId,
  onOpenTask,
  onNewTask,
  approvals,
  children,
}: AppShellProps) {
  const tight = usage.filter((p) => Number.parseInt(p.used, 10) >= NEAR_LIMIT);
  return (
    <div className="shell">
      <aside className="shell-side">
        <span className="shell-brand">
          <span className="shell-mark" aria-hidden="true" />
          Bezl
        </span>
        <div className="shell-lists">
          {onNewTask ? (
            <button type="button" className="shell-new" onClick={onNewTask}>
              <PlusIcon />
              New task
            </button>
          ) : null}
          {approvals ? (
            <nav aria-label="Areas" className="shell-tasks">
              <ul>
                <li>
                  <a
                    href="/approvals"
                    className="shell-task shell-area"
                    data-light={approvals.count > 0 ? "needsYou" : undefined}
                    aria-current={approvals.current ? "page" : undefined}
                    ref={approvals.current ? keepInView : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      approvals.onOpen();
                    }}
                  >
                    <span className="shell-task-icon">
                      <InboxIcon />
                    </span>
                    <span className="shell-task-title">Approvals</span>
                    {approvals.count > 0 ? (
                      <>
                        <span className="shell-count" aria-hidden="true">
                          {approvals.count}
                        </span>
                        <span className="shell-sr">{`, ${approvals.count} need you`}</span>
                      </>
                    ) : null}
                  </a>
                </li>
              </ul>
            </nav>
          ) : null}
          <nav aria-label="Tasks" className="shell-tasks">
            <ul>
              {tasks.map((task) => {
                const light = taskLight(task.stages);
                return (
                  <li key={task.id}>
                    <a
                      href={`#${task.id}`}
                      className="shell-task"
                      data-light={light}
                      aria-current={task.id === currentTaskId ? "page" : undefined}
                      ref={task.id === currentTaskId ? keepInView : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        onOpenTask(task.id);
                      }}
                    >
                      <span className="shell-task-icon">
                        <LightIcon light={light} />
                      </span>
                      <span className="shell-task-title">{task.title}</span>
                      <span className="shell-sr">{`, ${lightLabel[light]}`}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
        {agents.length ? (
          <ul className="shell-agents" aria-label="Coding agents">
            {agents.map((a) => (
              <li key={a.name}>
                <button
                  type="button"
                  className="shell-agent"
                  data-state={a.state}
                  onClick={onAgents}
                >
                  <LightIcon light={agentLight[a.state]} />
                  <span>{a.name}</span>
                  {/* Ready is the quiet default; only the other states take room. */}
                  <span className={a.state === "ready" ? "shell-sr" : "shell-agent-word"}>
                    {agentWord[a.state]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {tight.length ? (
          <dl className="shell-usage" aria-label="Coding agent usage">
            {tight.map((p) => (
              <div key={p.name}>
                <dt>{p.name}</dt>
                <dd>{p.used}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </aside>
      <main className="shell-main">{children}</main>
    </div>
  );
}
