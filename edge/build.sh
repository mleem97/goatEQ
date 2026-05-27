#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
VERSION=$(jq -r '.version' edge/manifest.json)
mkdir -p dist
tmpdir=$(mktemp -d)
cp edge/*.json edge/*.js edge/*.html edge/*.css edge/*.png "$tmpdir/" 2>/dev/null
node node_modules/crx3/bin/crx3.js \
  -o "dist/goatEQ-edge.crx" \
  -p ~/.ssh/browseraddons/goatEQ.pem \
  "$tmpdir"
rm -rf "$tmpdir"
echo "Edge package built: dist/goatEQ-edge.crx"
