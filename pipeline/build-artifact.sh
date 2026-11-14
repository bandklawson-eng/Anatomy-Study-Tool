#!/usr/bin/env bash
# Builds a copy of the app for hosts that only serve text files (geometry as base64 .glb.txt).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT_DIR=dist-artifact VITE_GEO_B64=1 npx vite build --outDir dist-artifact --emptyOutDir
cd dist-artifact/data/geo
for f in *.glb; do base64 -w0 "$f" > "$f.txt" && rm "$f"; done
cd ../..
rm -f sw.js manifest.webmanifest
