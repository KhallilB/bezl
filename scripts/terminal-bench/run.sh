#!/usr/bin/env bash
# M4 pass mark: three panes stream a 20 MB payload, an echo pane is timed, memory is sampled.
# Usage: scripts/terminal-bench/run.sh [out-dir]. Writes result.json and mem.log, then checks them.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
out="${1:-$(mktemp -d)}"
mkdir -p "$out" && out="$(cd "$out" && pwd)"
[ -f "$out/payload.txt" ] || head -c 15000000 /dev/urandom | base64 -b 76 > "$out/payload.txt"
rm -f "$out/result.json" "$out/mem.log"

# WebKit helpers are not children of the app: count the ones that appear after launch.
# Only the launched app, by pid: another checkout's Bezl would count by name.
# Pid set fixed once the app's three helpers are up (or 8 s): later helpers of other apps swung samples by 100s of MB.
# footprint counts shared pages once, as Activity Monitor does; an RSS sum counts them per process.
start_sampler() {
local app=$1
(
  frozen="" tick=0
  while true; do
    if [ -n "$frozen" ]; then
      pids=$frozen
    else
      pids=$(ps -axo pid=,comm= | awk -v app="$app" -v before="$(tr '\n' ' ' < "$out/webkit-before.txt")" '
        BEGIN { n = split(before, b, " "); for (i = 1; i <= n; i++) seen[b[i]] = 1 }
        $1 == app || ($2 ~ /WebKit/ && !($1 in seen)) { printf "-p %s ", $1 }')
      tick=$((tick + 1))
      if [ "$(echo "$pids" | grep -o -- -p | wc -l)" -ge 4 ] || [ $tick -ge 16 ]; then
        frozen=$pids
        echo "$frozen" > "$out/pids.txt"
      fi
    fi
    [ -n "$pids" ] && footprint -f bytes $pids 2>/dev/null | awk -v now="$(($(date +%s) * 1000))" '
      /phys_footprint:/ { sum += $2 } /Summary Footprint:/ { total = $3 }
      END { print now, int((total ? total : sum) / 1048576) }' >> "$out/mem.log"
    sleep 0.5
  done
) &
sampler=$!
trap 'kill $sampler 2>/dev/null' EXIT
}

# The production frontend, as shipped; Rust stays a debug build, which keeps the bench command.
config='{"app":{"windows":[{"title":"Bezl","width":1440,"height":900}]}}'
(cd "$root" && VITE_SCREEN=terminal-bench bun tauri build --debug --no-bundle --config "$config") > "$out/build.log" 2>&1 || {
  echo "build failed: $out/build.log"
  exit 1
}
ps -axo pid=,comm= | awk '/WebKit/ {print $1}' | sort > "$out/webkit-before.txt"
BEZL_TERMINAL_BENCH="$out" "$root/target/debug/bezl" > "$out/app.log" 2>&1 &
app=$!
start_sampler $app
(sleep 300 && kill $app 2>/dev/null) &
watchdog=$!
wait $app
echo "app exit=$?"
kill $sampler $watchdog 2>/dev/null
wait $sampler 2>/dev/null
bun "$here/check.ts" "$out"
