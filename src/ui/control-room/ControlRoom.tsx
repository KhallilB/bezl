import { Button, Dialog, Facet, Status } from "@kbui/react";
import { StateIcon } from "./icons";
import { presentation, type WorkerView } from "./model";

export type ControlRoomProps = {
  workers: WorkerView[];
  /** Fires only after the operator confirms in the dialog. */
  onStop: (workerId: string) => void;
};

type WorkerProps = { worker: WorkerView; onStop: ControlRoomProps["onStop"] };

function StopWorker({ worker, onStop }: WorkerProps) {
  return (
    <Dialog>
      <Dialog.Trigger render={<Button variant="secondary" size="sm" />}>Stop</Dialog.Trigger>
      <Dialog.Content
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
  return (
    <Facet tone={view.tone} cut={view.cut} rail={view.rail} aria-labelledby={headingId}>
      <Facet.Header>
        <h2 id={headingId}>{worker.name}</h2>
        <Status
          tone={view.status.tone}
          icon={<StateIcon state={worker.state} />}
          live={view.status.live}
        >
          {view.status.label}
        </Status>
      </Facet.Header>
      <Facet.Body>
        <p style={{ margin: 0 }}>{worker.summary}</p>
        {worker.transcript ? (
          <pre
            style={{
              margin: "var(--kb-space-3) 0 0",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              font: "var(--kb-size-sm) / 1.5 var(--kb-font-mono)",
              color: "var(--kb-color-muted)",
            }}
          >
            {worker.transcript}
          </pre>
        ) : null}
      </Facet.Body>
      {view.stoppable ? (
        <Facet.Footer>
          <StopWorker worker={worker} onStop={onStop} />
        </Facet.Footer>
      ) : null}
    </Facet>
  );
}

export function ControlRoom({ workers, onStop }: ControlRoomProps) {
  return (
    <main
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: "var(--kb-space-4)",
        padding: "var(--kb-space-4)",
        minHeight: "100vh",
        background: "var(--kb-color-bg)",
        color: "var(--kb-color-fg)",
        fontFamily: "var(--kb-font-sans)",
      }}
    >
      {workers.map((worker) => (
        <WorkerFacet key={worker.id} worker={worker} onStop={onStop} />
      ))}
    </main>
  );
}
