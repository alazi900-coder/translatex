#!/bin/bash
set -e

echo "=== Installing dependencies ==="
npm install -g pnpm
pnpm install --frozen-lockfile

echo "=== Building frontend ==="
BASE_PATH="/" PORT=3000 pnpm --filter @workspace/translatex run build

echo "=== Copying frontend to api-server ==="
mkdir -p artifacts/api-server/public
cp -r artifacts/translatex/dist/public/. artifacts/api-server/public/

echo "=== Building API server ==="
pnpm --filter @workspace/api-server run build

echo "=== Done ==="
