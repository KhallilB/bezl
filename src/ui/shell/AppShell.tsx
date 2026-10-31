import { Button } from "@kb.ui/react";
import type { ReactNode } from "react";
import { LightIcon } from "../journey/icons";
import { type JourneyTask, lightLabel, type ProviderUsage, taskLight } from "../journey/model";
import "./shell.css";

export type AppShellProps = {
  tasks: JourneyTask[];
  usage: ProviderUsage[];
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

/** The task list before the first task: one sentence and one action. */
export function EmptyTasks({ onNewTask }: { onNewTask: () => void }) {
  return (
    <section className="shell-empty" aria-labelledby="shell-empty-title">
      <h1 id="shell-empty-title">No tasks yet</h1>
      <p>
        Describe a change, choose who writes and who reviews, and Bezl sets up a worktree for it.
      </p>
      <Button variant="secondary" onClick={onNewTask}>
        <PlusIcon />
        New task
      </Button>
    </section>
  );
}

/** Sidebar of every task, each with its light, beside the open task. */
export function AppShell({
  tasks,
  usage,
  currentTaskId,
  onOpenTask,
  onNewTask,
  approvals,
  children,
}: AppShellProps) {
  return (
    <div className="shell">
      <aside className="shell-side">
        <span className="shell-brand">
          <span className="shell-mark" aria-hidden="true" />
          Bezl
        </span>
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
        <dl className="shell-usage" aria-label="Provider usage">
          {usage.map((p) => (
            <div key={p.name}>
              <dt>{p.name}</dt>
              <dd>{p.used}</dd>
            </div>
          ))}
        </dl>
      </aside>
      <main className="shell-main">{children}</main>
    </div>
  );
}
