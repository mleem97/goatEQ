#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
VERSION=$(jq -r '.version' chromium/manifest.json)
mkdir -p dist
tmpdir=$(mktemp -d)
cp chromium/manifest.json sw.js bg.js popup.html popup.js popup.css \
   offscreen.html snap.svg-min.js \
   goateq16.png goateq32.png goateq48.png goateq64.png goateq128.png "$tmpdir/"
node node_modules/crx3/bin/crx3.js \
  -o "dist/goatEQ-v${VERSION}-chrome.crx" \
  -p ~/.ssh/browseraddons/goatEQ.pem \
  "$tmpdir"
rm -rf "$tmpdir"
echo "Chrome package built: dist/goatEQ-v${VERSION}-chrome.crx"
