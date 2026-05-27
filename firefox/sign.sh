#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
VERSION=$(jq -r '.version' firefox/manifest.json)
mkdir -p dist
tmpdir=$(mktemp -d)
cp firefox/*.json firefox/*.js firefox/*.html firefox/*.css firefox/*.png "$tmpdir/" 2>/dev/null

npx web-ext sign \
  --source-dir "$tmpdir" \
  --artifacts-dir dist \
  --api-key "${MOZILLA_API_KEY:?Set MOZILLA_API_KEY env var (JWT issuer from AMO)}" \
  --api-secret "${MOZILLA_API_SECRET:?Set MOZILLA_API_SECRET env var (JWT secret from AMO)}" \
  --channel unlisted

rm -rf "$tmpdir"
echo "Firefox signed package: dist/goatEQ-signed.xpi"
