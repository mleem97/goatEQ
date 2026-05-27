#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
VERSION=$(jq -r '.version' firefox/manifest.json)
mkdir -p dist
tmpdir=$(mktemp -d)
cp firefox/*.json firefox/*.js firefox/*.html firefox/*.css firefox/*.png "$tmpdir/" 2>/dev/null
(cd "$tmpdir" && zip -r "../dist/goatEQ-firefox.zip" . > /dev/null)
cp dist/goatEQ-firefox.zip dist/goatEQ-firefox.xpi

rm -rf "$tmpdir"
echo "Firefox package built: dist/goatEQ-firefox.zip and dist/goatEQ-firefox.xpi"
