import { Badge, Button, Input, Panel, Toolbar } from "@kb.ui/react";
import { type MouseEvent, useState } from "react";
import { type Shot, type ShotPin, type ShotSize, shotWidth } from "./model";

type Note = ShotPin & { shot: string };

function Toggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <Toolbar aria-label={label}>
      {options.map(([v, name]) => (
        <Toolbar.Button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>
          {name}
        </Toolbar.Button>
      ))}
    </Toolbar>
  );
}

const sizes: [ShotSize, string][] = [
  ["phone", "Phone"],
  ["desktop", "Desktop"],
];

/** Screenshots Bezl took of the change, with its findings and your notes pinned on them. */
export function Preview({ shots, example }: { shots: Shot[]; example: Shot | null }) {
  const [picked, setPicked] = useState(shots[0]?.id);
  const [size, setSize] = useState<ShotSize>("phone");
  const [notes, setNotes] = useState<Note[]>([]);
  const [noting, setNoting] = useState(false);
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null);
  const [text, setText] = useState("");
  const shot = example ?? shots.find((s) => s.id === picked) ?? shots[0];
  if (!shot) return null;
  const width = shotWidth[size];
  const findings = (shot.findings ?? []).filter((p) => p.size === size);
  const mine = notes.filter((n) => n.shot === shot.id && n.size === size);
  const place = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    // A keyboard press has no pointer position, so the note starts in the middle.
    const centre = e.detail === 0 || r.width === 0;
    setSpot({
      x: centre ? 50 : ((e.clientX - r.left) / r.width) * 100,
      y: centre ? 50 : ((e.clientY - r.top) / r.height) * 100,
    });
  };
  const stop = () => {
    setNoting(false);
    setSpot(null);
    setText("");
  };
  return (
    <div className="journey-preview">
      <div className="journey-preview-tools">
        {shots.length > 1 && !example ? (
          <Toggle
            label="Screenshot"
            value={shot.id}
            options={shots.map((s) => [s.id, s.name])}
            onChange={setPicked}
          />
        ) : (
          <span className="journey-preview-name">{shot.name}</span>
        )}
        <Toggle label="Size" value={size} options={sizes} onChange={setSize} />
      </div>
      <Panel.Well>
        <figure className="journey-shot" data-size={size}>
          <div className="journey-shot-frame" data-example={shot.example ? "" : undefined}>
            <img src={shot.images[size]} alt={`${shot.screen}, ${shot.name}, at ${width} px`} />
            {shot.example ? (
              <Badge tone="info" className="journey-shot-tag">
                Example, not built yet
              </Badge>
            ) : null}
            {findings.map((p, i) => (
              <span
                key={p.text}
                className="journey-pin"
                data-kind="finding"
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                aria-hidden="true"
              >
                {String.fromCharCode(65 + i)}
              </span>
            ))}
            {mine.map((n, i) => (
              <span
                key={`${n.x}-${n.y}`}
                className="journey-pin"
                style={{ left: `${n.x}%`, top: `${n.y}%` }}
                aria-hidden="true"
              >
                {i + 1}
              </span>
            ))}
            {spot ? (
              <span
                className="journey-pin"
                data-draft=""
                style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                aria-hidden="true"
              >
                {mine.length + 1}
              </span>
            ) : null}
            {noting && !spot ? (
              <button type="button" className="journey-shot-place" onClick={place}>
                <span className="journey-sr">Put your note here</span>
              </button>
            ) : null}
          </div>
          <figcaption className="journey-shot-caption">
            {`${width} px · ${shot.from} · ${shot.commit}`}
          </figcaption>
        </figure>
      </Panel.Well>
      {findings.length || mine.length ? (
        <ol className="journey-pins" aria-label="On this screenshot">
          {findings.map((p, i) => (
            <li key={p.text}>
              <Badge tone="danger" mono aria-hidden="true">
                {String.fromCharCode(65 + i)}
              </Badge>
              {p.text}
            </li>
          ))}
          {mine.map((n, i) => (
            <li key={`${n.x}-${n.y}`}>
              <Badge tone="info" mono aria-hidden="true">
                {i + 1}
              </Badge>
              {n.text}
            </li>
          ))}
        </ol>
      ) : null}
      {shot.example ? null : spot ? (
        <form
          className="journey-note"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            setNotes([...notes, { shot: shot.id, size, ...spot, text: text.trim() }]);
            stop();
          }}
        >
          <Input
            label="Your note"
            visuallyHidden
            className="journey-note-field"
            // You just placed the note, so you type it next.
            autoFocus
            value={text}
            onValueChange={setText}
            placeholder="What should change here?"
          />
          <Button size="sm" variant="secondary" type="submit" disabled={!text.trim()}>
            Add note
          </Button>
          <Button size="sm" variant="ghost" onClick={stop}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="journey-note-actions">
          {noting ? (
            <p className="journey-steer-note" role="status">
              Click the spot your note is about.
            </p>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => (noting ? stop() : setNoting(true))}>
            {noting ? "Cancel" : mine.length ? "Add another note" : "Add a note"}
          </Button>
        </div>
      )}
    </div>
  );
}
