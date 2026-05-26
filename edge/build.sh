#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
VERSION=$(jq -r '.version' edge/manifest.json)
mkdir -p dist
tmpdir=$(mktemp -d)
cp edge/manifest.json sw.js bg.js popup.html popup.js popup.css \
   offscreen.html snap.svg-min.js \
   goateq16.png goateq32.png goateq48.png goateq64.png goateq128.png "$tmpdir/"
cd "$tmpdir" && zip -r "$OLDPWD/dist/goatEQ-v${VERSION}-edge.zip" . && cd "$OLDPWD"
rm -rf "$tmpdir"
echo "Edge package built: dist/goatEQ-v${VERSION}-edge.zip"
