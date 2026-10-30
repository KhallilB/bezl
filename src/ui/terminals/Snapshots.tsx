import { useEffect, useState } from "react";
import type { Saved, SavedRef, TerminalRecord } from "./port";
import { SnapshotViewer } from "./SnapshotViewer";
import "./terminals.css";

/** Every terminal snapshot in the record, newest first; one opens in the viewer. */
export function Snapshots({ record }: { record: TerminalRecord }) {
  const [refs, setRefs] = useState<SavedRef[] | null>(null);
  const [open, setOpen] = useState<Saved | null>(null);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let live = true;
    record.list().then(
      (r) => live && setRefs(r),
      (e: unknown) => live && setError(String(e)),
    );
    return () => {
      live = false;
    };
  }, [record]);
  const show = (ref: SavedRef) =>
    record.open(ref).then(setOpen, (e: unknown) => setError(String(e)));

  return (
    <main className="terminals-screen">
      <h1 className="terminals-heading">Snapshots</h1>
      {error ? <p className="terminal-says">{error}</p> : null}
      {refs?.length === 0 ? (
        <p>No snapshots yet. Take one from a pane on the Terminals screen.</p>
      ) : null}
      <div className="snapshots-layout">
        <ul className="snapshots-list" aria-label="Saved snapshots">
          {refs?.map((r) => (
            <li key={`${r.pane}-${r.takenAt}`}>
              <button
                type="button"
                className="snapshots-item"
                aria-current={
                  open?.pane === r.pane && open.takenAt === r.takenAt ? "true" : undefined
                }
                onClick={() => void show(r)}
              >
                <span>{r.pane}</span>
                <time dateTime={new Date(r.takenAt).toISOString()}>
                  {new Date(r.takenAt).toLocaleString()}
                </time>
              </button>
            </li>
          ))}
        </ul>
        {open ? <SnapshotViewer saved={open} /> : null}
      </div>
    </main>
  );
}
