import { Badge, Button, Dialog, Panel, Progress, ScrollArea, Stat, Status } from "@kb.ui/react";
import type { CSSProperties } from "react";
import { usePortalRoot } from "../theme/AppTheme";
import { ActivityTrace } from "./ActivityTrace";
import "./task.css";
import { StateIcon } from "./icons";
import {
  accessLabel,
  focusedWorkerOf,
  presentation,
  roleLabel,
  states,
  type TaskView,
  type WorkerView,
} from "./model";
import { WorkerMap } from "./WorkerMap";

export type TaskProps = {
  task: TaskView;
  workers: WorkerView[];
  /** Fires only after the operator confirms in the dialog. */
  onStop: (workerId: string) => void;
};

type WorkerProps = { worker: WorkerView; onStop: TaskProps["onStop"] };

function StopWorker({ worker, onStop }: WorkerProps) {
  const portal = usePortalRoot();
  return (
    <Dialog>
      <Dialog.Trigger render={<Button variant="secondary" size="sm" />}>Stop</Dialog.Trigger>
      <Dialog.Content
        {...(portal ? { container: portal } : {})}
        title={`Stop ${worker.name}?`}
        description="The worker's process ends now. Its output so far stays in the evidence log."
      >
        <Dialog.Actions>
          <Dialog.Close render={<Button variant="ghost" />}>Keep going</Dialog.Close>
          <Dialog.Close render={<Button variant="danger" />} onClick={() => onStop(worker.id)}>
            Stop worker
          </Dialog.Close>
        </Dialog.Actions>
      </Dialog.Content>
    </Dialog>
  );
}

function Output({ worker }: { worker: WorkerView }) {
  if (!worker.transcript) return null;
  return (
    <Panel.Well>
      <ScrollArea label={`${worker.name} output`} maxHeight="12rem">
        <pre className="task-transcript">{worker.transcript}</pre>
      </ScrollArea>
    </Panel.Well>
  );
}

function Readout({ worker }: { worker: WorkerView }) {
  const { step } = worker;
  return (
    <div className="task-readout">
      {worker.elapsed ? (
        <Stat
          size="display"
          label={worker.state === "blocked" ? "Waiting" : "Elapsed"}
          value={worker.elapsed}
        />
      ) : null}
      {step ? (
        <Progress
          className="task-step"
          label={step.label}
          value={step.index}
          max={step.total}
          valueText={`Step ${step.index} of ${step.total}`}
        />
      ) : null}
    </div>
  );
}

function WorkerPanel({
  worker,
  onStop,
  focused,
  index,
}: WorkerProps & { focused: boolean; index: number }) {
  const view = presentation[worker.state];
  const headingId = `worker-${worker.id}-title`;
  const meta = [worker.branch, focused ? undefined : worker.elapsed].filter(Boolean).join(" · ");
  return (
    <div
      className="task-cell"
      data-state={worker.state}
      {...(focused ? { "data-focused": "" } : {})}
      style={{ "--task-i": index } as CSSProperties}
    >
      <Panel tone={view.tone} rail={view.rail} aria-labelledby={headingId}>
        <Panel.Header>
          <div className="task-heading">
            <Badge appearance="plain" mono className="task-eyebrow">
              {`${roleLabel[worker.role]} · ${worker.provider} · ${accessLabel[worker.role]}`}
            </Badge>
            <h2 id={headingId}>{worker.name}</h2>
          </div>
          <Status
            appearance="chip"
            tone={view.status.tone}
            icon={<StateIcon state={worker.state} />}
            live={view.status.live}
          >
            {view.status.label}
          </Status>
        </Panel.Header>
        <Panel.Body className="task-body">
          {focused ? <Readout worker={worker} /> : null}
          {focused && worker.activity ? <ActivityTrace samples={worker.activity} /> : null}
          {focused && worker.step ? null : (
            <p className={worker.state === "blocked" ? "task-line task-ask" : "task-line"}>
              {worker.summary}
            </p>
          )}
          <Output worker={worker} />
        </Panel.Body>
        {meta || view.stoppable ? (
          <Panel.Footer>
            {meta ? (
              <Badge appearance="plain" mono preserveCase className="task-meta">
                {meta}
              </Badge>
            ) : null}
            {view.stoppable ? <StopWorker worker={worker} onStop={onStop} /> : null}
          </Panel.Footer>
        ) : null}
      </Panel>
    </div>
  );
}

function Summary({ workers }: { workers: WorkerView[] }) {
  const counts = states
    .map((state) => [state, workers.filter((w) => w.state === state).length] as const)
    .filter(([, n]) => n > 0);
  return (
    <ul className="task-summary" aria-label="Workers by state">
      {counts.map(([state, n]) => (
        <li key={state}>
          <Status
            appearance="chip"
            compact
            tone={presentation[state].status.tone}
            icon={<StateIcon state={state} />}
          >
            {`${n} ${state}`}
          </Status>
        </li>
      ))}
    </ul>
  );
}

export function Task({ task, workers, onStop }: TaskProps) {
  const focused = focusedWorkerOf(workers);
  const rest = workers.filter((w) => w !== focused);
  return (
    <div className="task-screen">
      <header className="task-header">
        <span className="task-brand">
          <span className="task-mark" aria-hidden="true" />
          Bezl
        </span>
        <span className="task-crumb" aria-hidden="true">
          /
        </span>
        <h1 className="task-title">
          Task <span className="task-title-branch">{task.branch}</span>
        </h1>
        <Summary workers={workers} />
      </header>
      <section className="task-map" aria-label="Worker map">
        <WorkerMap task={task} workers={workers} />
      </section>
      <main className="task-grid" data-layout={focused ? "bento" : "grid"}>
        {focused ? <WorkerPanel worker={focused} onStop={onStop} focused index={0} /> : null}
        {rest.map((worker, i) => (
          <WorkerPanel
            key={worker.id}
            worker={worker}
            onStop={onStop}
            focused={false}
            index={i + (focused ? 1 : 0)}
          />
        ))}
      </main>
    </div>
  );
}
