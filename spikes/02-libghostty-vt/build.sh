#!/usr/bin/env bash
# Usage: ./build.sh <zig-bin-dir>  — times a clean build with that Zig first on PATH.
set -u
cd "$(dirname "$0")"
export PATH="$1:$PATH"
zig version
cargo clean -q
start=$(date +%s)
cargo build 2>&1 | tail -25
echo "exit=${PIPESTATUS[0]} seconds=$(( $(date +%s) - start ))"
