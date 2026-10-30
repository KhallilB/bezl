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
  children: ReactNode;
};

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 3.25v9.5M3.25 8h9.5" strokeLinecap="round" />
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
