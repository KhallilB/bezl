import { Badge, Button, Dialog, Input, Panel, Toolbar } from "@kb.ui/react";
import { type MouseEvent, type ReactNode, useState } from "react";
import { usePortalRoot } from "../theme/AppTheme";
import { type Shot, type ShotPin, type ShotSize, shotWidth } from "./model";

type Note = ShotPin & { shot: string };

function Toggle<T extends string>({
  label,
  value,
  options,
  onChange,
  shown,
  className = "journey-tool",
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  /** Label shown above it; the review has room, the side does not. */
  shown?: boolean;
  className?: string;
}) {
  const bar = (
    <Toolbar aria-label={label}>
      {options.map(([v, name]) => (
        <Toolbar.Button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>
          {name}
        </Toolbar.Button>
      ))}
    </Toolbar>
  );
  return shown ? (
    <span className={className}>
      <span className="journey-eyebrow" aria-hidden="true">
        {label}
      </span>
      {bar}
    </span>
  ) : (
    bar
  );
}

const sizes: [ShotSize, string][] = [
  ["phone", "Phone"],
  ["desktop", "Desktop"],
];

type Spot = { x: number; y: number };

const letter = (i: number) => String.fromCharCode(65 + i);

/** One screenshot with Bezl's findings (letters) and your notes (numbers) on it. */
function ShotFigure({
  shot,
  size,
  notes,
  spot,
  named,
  onPlace,
}: {
  shot: Shot;
  size: ShotSize;
  notes: Note[];
  spot?: Spot | null;
  /** Beside another, so the caption says which one it is. */
  named?: boolean;
  onPlace?: ((e: MouseEvent<HTMLButtonElement>) => void) | undefined;
}) {
  const width = shotWidth[size];
  const findings = (shot.findings ?? []).filter((p) => p.size === size);
  const mine = notes.filter((n) => n.shot === shot.id && n.size === size);
  return (
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
            {letter(i)}
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
        {onPlace ? (
          <button type="button" className="journey-shot-place" onClick={onPlace}>
            <span className="journey-sr">Put your note here</span>
          </button>
        ) : null}
      </div>
      <figcaption className="journey-shot-caption">
        {`${named ? `${shot.name} · ` : ""}${width} px · ${shot.from} · ${shot.commit}`}
      </figcaption>
    </figure>
  );
}

function PinList({
  shot,
  size,
  notes,
  label,
}: {
  shot: Shot;
  size: ShotSize;
  notes: Note[];
  label: string;
}) {
  const findings = (shot.findings ?? []).filter((p) => p.size === size);
  const mine = notes.filter((n) => n.shot === shot.id && n.size === size);
  return findings.length || mine.length ? (
    <ol className="journey-pins" aria-label={label}>
      {findings.map((p, i) => (
        <li key={p.text}>
          <Badge tone="danger" mono aria-hidden="true">
            {letter(i)}
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
  ) : null;
}

/** Screenshots Bezl took of the change, pinned; Expand opens them full window, two side by side. */
export function Preview({ shots, example }: { shots: Shot[]; example: Shot | null }) {
  const portal = usePortalRoot();
  const [picked, setPicked] = useState(shots[0]?.id);
  const [size, setSize] = useState<ShotSize>("phone");
  const [notes, setNotes] = useState<Note[]>([]);
  const [noting, setNoting] = useState(false);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [text, setText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [beside, setBeside] = useState("");
  const shot = example ?? shots.find((s) => s.id === picked) ?? shots[0];
  if (!shot) return null;
  const other = shots.find((s) => s.id === beside && s.id !== shot.id);
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
  const tools = (wide: boolean, beside?: ReactNode) => (
    <>
      {shots.length > 1 && !example ? (
        <Toggle
          label="Screenshot"
          value={shot.id}
          options={shots.map((s) => [s.id, s.name])}
          onChange={setPicked}
          shown={wide}
        />
      ) : (
        <span className="journey-preview-name">{shot.name}</span>
      )}
      {beside}
      <Toggle label="Size" value={size} options={sizes} onChange={setSize} shown={wide} />
    </>
  );
  const figure = (
    <ShotFigure
      shot={shot}
      size={size}
      notes={notes}
      spot={spot}
      named={Boolean(other)}
      onPlace={noting && !spot ? place : undefined}
    />
  );
  const noteTools = shot.example ? null : spot ? (
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
  );
  const pins = <PinList shot={shot} size={size} notes={notes} label="On this screenshot" />;
  return (
    <div className="journey-preview">
      {expanded ? null : (
        <>
          <div className="journey-preview-tools">{tools(false)}</div>
          <Panel.Well className="journey-preview-well">
            {figure}
            <Button
              size="sm"
              variant="secondary"
              className="journey-expand"
              onClick={() => setExpanded(true)}
            >
              Expand
            </Button>
          </Panel.Well>
          {pins}
          {noteTools}
        </>
      )}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        {expanded ? (
          <Dialog.Content
            {...(portal ? { container: portal } : {})}
            title={`Design review · ${shot.screen}`}
            description="Bezl's findings and your notes, pinned where they are."
            className="journey-review"
          >
            <div className="journey-preview-tools">
              {tools(
                true,
                shots.length > 1 ? (
                  <Toggle
                    label="Beside it"
                    value={other?.id ?? ""}
                    options={[
                      ["", "Nothing"],
                      ...shots
                        .filter((s) => s.id !== shot.id)
                        .map((s): [string, string] => [s.id, s.name]),
                    ]}
                    onChange={setBeside}
                    shown
                    className="journey-tool journey-beside"
                  />
                ) : null,
              )}
            </div>
            <div className="journey-review-body">
              <Panel.Well className="journey-review-canvas">
                {figure}
                {other ? <ShotFigure shot={other} size={size} notes={notes} named /> : null}
              </Panel.Well>
              <div className="journey-review-rail">
                {pins}
                {other ? (
                  <PinList shot={other} size={size} notes={notes} label={`On ${other.name}`} />
                ) : null}
                {noteTools}
              </div>
            </div>
            <Dialog.Actions>
              <Dialog.Close render={<Button variant="secondary" />}>Close</Dialog.Close>
            </Dialog.Actions>
          </Dialog.Content>
        ) : null}
      </Dialog>
    </div>
  );
}
