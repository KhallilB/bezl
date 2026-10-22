import { Button, Dialog, Facet, Status } from "@kbui/react";
import type { CSSProperties } from "react";
import { usePortalRoot } from "../skin/FacetedOperationsSkin";
import { ActivityTrace } from "./ActivityTrace";
import "./control-room.css";
import { StateIcon } from "./icons";
import {
  accessLabel,
  heroOf,
  presentation,
  roleLabel,
  states,
  type TaskView,
  type WorkerView,
} from "./model";
import { Orbit } from "./Orbit";

export type ControlRoomProps = {
  task: TaskView;
  workers: WorkerView[];
  /** Fires only after the operator confirms in the dialog. */
  onStop: (workerId: string) => void;
};

type WorkerProps = { worker: WorkerView; onStop: ControlRoomProps["onStop"] };

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
    <Facet.Well role="region" aria-label={`${worker.name} output`}>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable output must take keyboard focus to scroll. */}
      <pre className="cr-transcript" tabIndex={0}>
        {worker.transcript}
      </pre>
    </Facet.Well>
  );
}

function Readout({ worker }: { worker: WorkerView }) {
  const { step } = worker;
  return (
    <div className="cr-readout">
      {worker.elapsed ? (
        <p className="cr-elapsed">
          <span className="cr-num">{worker.elapsed}</span>
          <span className="cr-unit">{worker.state === "blocked" ? "waiting" : "elapsed"}</span>
        </p>
      ) : null}
      {step ? (
        <div className="cr-step">
          <span>
            <b>{`Step ${step.index} of ${step.total}`}</b>
            {` · ${step.label}`}
          </span>
          <div
            className="cr-progress"
            role="progressbar"
            aria-label={`Step ${step.index} of ${step.total}: ${step.label}`}
            aria-valuemin={0}
            aria-valuenow={step.index}
            aria-valuemax={step.total}
            style={{ "--cr-progress": step.index / step.total } as CSSProperties}
          >
            <span />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function WorkerPanel({ worker, onStop, hero }: WorkerProps & { hero: boolean }) {
  const view = presentation[worker.state];
  const headingId = `worker-${worker.id}-title`;
  const meta = [worker.branch, hero ? undefined : worker.elapsed].filter(Boolean).join(" · ");
  return (
    <div className="cr-cell" data-state={worker.state} {...(hero ? { "data-hero": "" } : {})}>
      <Facet tone={view.tone} rail={view.rail} aria-labelledby={headingId}>
        <Facet.Header>
          <div className="cr-heading">
            <p className="cr-eyebrow">
              {`${roleLabel[worker.role]} · ${worker.provider} · ${accessLabel[worker.role]}`}
            </p>
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
        </Facet.Header>
        <Facet.Body className="cr-body">
          {hero ? <Readout worker={worker} /> : null}
          {hero && worker.activity ? <ActivityTrace samples={worker.activity} /> : null}
          {hero && worker.step ? null : (
            <p className={worker.state === "blocked" ? "cr-line cr-ask" : "cr-line"}>
              {worker.summary}
            </p>
          )}
          <Output worker={worker} />
        </Facet.Body>
        {meta || view.stoppable ? (
          <Facet.Footer>
            {meta ? <span className="cr-meta">{meta}</span> : null}
            {view.stoppable ? <StopWorker worker={worker} onStop={onStop} /> : null}
          </Facet.Footer>
        ) : null}
      </Facet>
    </div>
  );
}

function Summary({ workers }: { workers: WorkerView[] }) {
  const counts = states
    .map((state) => [state, workers.filter((w) => w.state === state).length] as const)
    .filter(([, n]) => n > 0);
  return (
    <ul className="cr-summary" aria-label="Workers by state">
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

export function ControlRoom({ task, workers, onStop }: ControlRoomProps) {
  const hero = heroOf(workers);
  const rest = workers.filter((w) => w !== hero);
  return (
    <div className="cr-room">
      <header className="cr-bar">
        <span className="cr-brand">
          <span className="cr-mark" aria-hidden="true" />
          Bezl
        </span>
        <span className="cr-crumb" aria-hidden="true">
          /
        </span>
        <h1 className="cr-title">Control Room</h1>
        <Summary workers={workers} />
      </header>
      <section className="cr-orbit" aria-label="Task map">
        <Orbit task={task} workers={workers} />
      </section>
      <main className="cr-grid" data-layout={hero ? "bento" : "grid"}>
        {hero ? <WorkerPanel worker={hero} onStop={onStop} hero /> : null}
        {rest.map((worker) => (
          <WorkerPanel key={worker.id} worker={worker} onStop={onStop} hero={false} />
        ))}
      </main>
    </div>
  );
}
