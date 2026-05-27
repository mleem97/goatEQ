#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
VERSION=$(jq -r '.version' firefox/manifest.json)
mkdir -p dist
tmpdir=$(mktemp -d)
cp firefox/*.json firefox/*.js firefox/*.html firefox/*.css firefox/*.png "$tmpdir/" 2>/dev/null

if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

npx web-ext sign \
  --source-dir "$tmpdir" \
  --artifacts-dir dist \
  --api-key "${FIREFOX_API_KEY:?Set FIREFOX_API_KEY in .env}" \
  --api-secret "${FIREFOX_API_SECRET:?Set FIREFOX_API_SECRET in .env}" \
  --channel unlisted

rm -rf "$tmpdir"
echo "Firefox signed package: dist/goatEQ-signed.xpi"
