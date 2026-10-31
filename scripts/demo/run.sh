#!/usr/bin/env bash
# A milestone demo, scripted in the real app with this machine's CLIs. The app snapshots
# its own webview, so no Screen Recording permission is needed.
# Usage: scripts/demo/run.sh providers|terminals [out-dir]. Writes numbered PNGs and result.json.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
scenario="${1:-}"
case "$scenario" in
  providers | terminals) ;;
  *)
    echo "usage: $0 providers|terminals [out-dir]"
    exit 2
    ;;
esac
out="${2:-$(mktemp -d)}"
mkdir -p "$out" && out="$(cd "$out" && pwd)"
rm -f "$out"/[0-9]*.png "$out/result.json"

# M3's impostor: a `codex` that prints a bare version, first on PATH. ProvidersDemo expects 0.0.1.
mkdir -p "$out/bin"
printf '#!/bin/sh\necho 0.0.1\n' > "$out/bin/codex"
chmod +x "$out/bin/codex"

# The production frontend with the demo screen; Rust stays a debug build, which keeps the driver.
config='{"app":{"windows":[{"title":"Bezl","width":1440,"height":900,"backgroundThrottling":"disabled"}]}}'
(cd "$root" && VITE_SCREEN=demo bun tauri build --debug --no-bundle --config "$config") > "$out/build.log" 2>&1 || {
  echo "build failed: $out/build.log"
  exit 1
}
PATH="$out/bin:$PATH" BEZL_DEMO="$out" BEZL_DEMO_SCENARIO="$scenario" "$root/target/debug/bezl" > "$out/app.log" 2>&1 &
app=$!
(sleep 400 && kill $app 2>/dev/null) &
watchdog=$!
wait $app
echo "app exit=$?"
kill $watchdog 2>/dev/null
wait $watchdog 2>/dev/null
[ -f "$out/result.json" ] || {
  echo "no result.json: $out/app.log"
  exit 1
}
echo "$out"
bun -e '
const r = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
for (const a of r.asserts) console.log(`${a.pass ? "pass" : "FAIL"}  ${a.name}: ${a.detail}`);
const missing = r.frames.filter((f) => !require("node:fs").existsSync(f));
console.log(`${r.frames.length} frames${missing.length ? `, missing: ${missing.join(" ")}` : ""}`);
process.exit(r.pass && r.frames.length > 0 && missing.length === 0 ? 0 : 1);
' "$out/result.json"
