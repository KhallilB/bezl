import { Button, Dialog, Facet, Status } from "@kbui/react";
import { usePortalRoot } from "../skin/FacetedOperationsSkin";
import "./control-room.css";
import { Mark, StateIcon } from "./icons";
import { presentation, roleLabel, states, type WorkerView } from "./model";

export type ControlRoomProps = {
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

function WorkerFacet({ worker, onStop }: WorkerProps) {
  const view = presentation[worker.state];
  const headingId = `worker-${worker.id}-title`;
  const meta = [worker.branch, worker.elapsed].filter(Boolean).join(" · ");
  return (
    <Facet tone={view.tone} cut="both" rail={view.rail} aria-labelledby={headingId}>
      <Facet.Header>
        <div className="cr-heading">
          <p className="cr-eyebrow">{`${roleLabel[worker.role]} · ${worker.provider}`}</p>
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
        <p className="cr-line">{worker.summary}</p>
        {worker.transcript ? (
          <Facet tone="sunken" cut="end" aria-label={`${worker.name} output`}>
            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable output must take keyboard focus to scroll. */}
            <pre className="cr-transcript" tabIndex={0}>
              {worker.transcript}
            </pre>
          </Facet>
        ) : null}
      </Facet.Body>
      {meta || view.stoppable ? (
        <Facet.Footer>
          {meta ? <span className="cr-meta">{meta}</span> : null}
          {view.stoppable ? <StopWorker worker={worker} onStop={onStop} /> : null}
        </Facet.Footer>
      ) : null}
    </Facet>
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

export function ControlRoom({ workers, onStop }: ControlRoomProps) {
  return (
    <div className="cr-room">
      <header className="cr-bar">
        <span className="cr-brand">
          <Mark />
          Bezl
        </span>
        <h1 className="cr-title">Control Room</h1>
        <Summary workers={workers} />
      </header>
      <main className="cr-grid">
        {workers.map((worker) => (
          <WorkerFacet key={worker.id} worker={worker} onStop={onStop} />
        ))}
      </main>
    </div>
  );
}
