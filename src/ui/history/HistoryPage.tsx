import { Button, Dialog } from "@kb.ui/react";
import { useState } from "react";
import { stageLabel } from "../journey/model";
import { Files } from "../journey/StageViews";
import { usePortalRoot } from "../theme/AppTheme";
import type { Snapshot, TaskHistory } from "./model";
import "./history.css";

function SnapshotViewer({ snapshot, onClose }: { snapshot: Snapshot | null; onClose: () => void }) {
  const portal = usePortalRoot();
  return (
    <Dialog open={snapshot !== null} onOpenChange={(open) => (open ? null : onClose())}>
      {snapshot ? (
        <Dialog.Content
          {...(portal ? { container: portal } : {})}
          title={`Snapshot · take ${snapshot.take} · ${snapshot.model}`}
          description={`The terminal as it was at ${snapshot.at}.`}
          className="history-viewer"
        >
          <pre className="history-screen">{snapshot.lines.join("\n")}</pre>
          <Dialog.Actions>
            <Dialog.Close render={<Button variant="secondary" />}>Close</Dialog.Close>
          </Dialog.Actions>
        </Dialog.Content>
      ) : null}
    </Dialog>
  );
}

/** A task's full record for reading: timeline, snapshots, each worker's changes. */
export function HistoryPage({ history, onBack }: { history: TaskHistory; onBack: () => void }) {
  const [open, setOpen] = useState<Snapshot | null>(null);
  return (
    <article className="history page" aria-labelledby="history-title">
      <header className="page-title-row">
        <h1 id="history-title" className="page-title">
          History
        </h1>
        <span className="page-tag">{`${history.title} · ${history.repo}`}</span>
        <span className="page-action">
          <Button variant="ghost" size="sm" onClick={onBack}>
            Back to task
          </Button>
        </span>
      </header>

      <ul className="history-spent" aria-label="Time spent">
        {history.spent.map((s) => (
          <li key={s.label}>
            <span>{s.label}</span>
            <strong>{s.value}</strong>
          </li>
        ))}
      </ul>

      <section className="history-section" aria-labelledby="history-timeline">
        <h2 id="history-timeline" className="page-label">
          Timeline
        </h2>
        <ol className="history-timeline" aria-labelledby="history-timeline">
          {history.events.map((e) => {
            const snapshot = history.snapshots.find((s) => s.id === e.snapshot);
            return (
              <li
                key={`${e.at}-${e.who}-${e.text}`}
                className="history-event"
                data-light={e.light}
                data-you={e.who === "You" ? "" : undefined}
              >
                <time className="history-at">{e.at}</time>
                <span className="history-dot" aria-hidden="true" />
                <span className="history-body">
                  <span className="history-who">{e.who}</span>
                  <span className="history-text">{e.text}</span>
                  <span className="history-stage">{stageLabel[e.stage]}</span>
                </span>
                {snapshot ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="history-open"
                    aria-label={`Open snapshot, take ${snapshot.take} at ${snapshot.at}`}
                    onClick={() => setOpen(snapshot)}
                  >
                    Open snapshot
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="history-section" aria-labelledby="history-changes">
        <h2 id="history-changes" className="page-label">
          What each worker changed
        </h2>
        <div className="history-changes">
          {history.changes.map((take) => (
            <div key={take.id} className="history-take">
              <span className="history-take-name">{`Take ${take.id} · ${take.model}`}</span>
              <Files files={take.files ?? []} label={`Files take ${take.id} changed`} />
            </div>
          ))}
        </div>
      </section>

      <SnapshotViewer snapshot={open} onClose={() => setOpen(null)} />
    </article>
  );
}
