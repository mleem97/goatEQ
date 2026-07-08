#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
VERSION=$(jq -r '.version' chromium/manifest.json)
mkdir -p dist
tmpdir=$(mktemp -d)
cp chromium/*.json chromium/*.js chromium/*.html chromium/*.css chromium/*.png "$tmpdir/" 2>/dev/null
node node_modules/crx3/bin/crx3.js \
  -o "dist/goatEQ-v${VERSION}-chrome.crx" \
  -p ~/.ssh/browseraddons/goatEQ.pem \
  "$tmpdir"

(cd "$tmpdir" && zip -r "$GITHUB_WORKSPACE/dist/goatEQ-v${VERSION}-chrome.zip" . > /dev/null)

rm -rf "$tmpdir"
echo "Chrome package built: dist/goatEQ-v${VERSION}-chrome.crx and dist/goatEQ-v${VERSION}-chrome.zip"
