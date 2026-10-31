import type { ReactNode } from "react";
import { LightIcon } from "../journey/icons";
import { type JourneyTask, lightLabel, type ProviderUsage, taskLight } from "../journey/model";
import "./shell.css";

export type AppShellProps = {
  tasks: JourneyTask[];
  usage: ProviderUsage[];
  currentTaskId?: string;
  onOpenTask: (taskId: string) => void;
  children: ReactNode;
};

/** Sidebar of every task, each with its light, beside the open task. */
export function AppShell({ tasks, usage, currentTaskId, onOpenTask, children }: AppShellProps) {
  return (
    <div className="shell">
      <aside className="shell-side">
        <span className="shell-brand">
          <span className="shell-mark" aria-hidden="true" />
          Bezl
        </span>
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
