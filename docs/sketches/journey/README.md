# Journey sketch

An interactive sketch of the task journey described in the [product vision](../../vision.md). It runs on sample data and is not wired to Bezl's domain.

Open `index.html` in a browser after `bun install` at the repository root; it loads kbui's CSS from `node_modules`.

- Click a stage in the stage strip to see it. Takes finish building a few seconds after the page loads.
- On Build: U, P, D and R switch between Use, Point, Draw and Record. Drag empty space to pan, scroll to move, and ⌘-scroll to zoom.
- To try a recording: press R, click "New project" in take A, type a name, click Create, then Stop. Add a note to step 1 such as "The name field should be focused", then Replay.
- "+ New task" opens the guided brief.

Known limits: marks drawn on a preview are pinned to pixels, so they do not follow a take switched to Narrow, and replay results are scripted.

`screens/` holds screenshots at 1440 by 900.
