#!/usr/bin/env bash
# Runs the PTY spike app once. Samples RSS of the app plus WebKit helper processes
# that did not exist before launch (WKWebView helpers are not children of the app).
set -u
cd "$(dirname "$0")"
D="$(pwd)"
rm -f result.json mem.log
export BEZL_SPIKE_PAYLOAD="$D/payload.txt"
ps -axo pid=,comm= | awk '/WebKit/ {print $1}' | sort > webkit-before.txt
(
  while true; do
    ps -axo pid=,rss=,comm= | awk -v before="$(tr '\n' ' ' < webkit-before.txt)" '
      BEGIN { n = split(before, b, " "); for (i = 1; i <= n; i++) seen[b[i]] = 1 }
      $3 ~ /bezl$/ { s += $2 }
      $3 ~ /WebKit/ && !($1 in seen) { s += $2 }
      END { print int(s / 1024) }' >> mem.log
    sleep 1
  done
) &
SAMPLER=$!
start=$(date +%s)
(cd ../.. && timeout 900 bun tauri dev --no-watch) > dev.log 2>&1
echo "dev exit=$? seconds=$(( $(date +%s) - start ))"
kill $SAMPLER 2>/dev/null
rm -f webkit-before.txt
echo "peak_mb=$(sort -n mem.log | tail -1)"
pgrep -f "node.*vite" | xargs kill 2>/dev/null
cat result.json 2>/dev/null || echo "NO RESULT"
