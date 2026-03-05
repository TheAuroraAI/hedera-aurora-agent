#!/bin/bash
# Hedera Apex Hackathon — Deployment Script
# Run this once HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY are set in .env

set -e

echo "=== Persistent — Hedera Deployment ==="
echo "Network: ${HEDERA_NETWORK:-testnet}"
echo ""

# Verify .env exists
if [ ! -f .env ]; then
  echo "ERROR: .env file not found. Copy .env.example and fill in your credentials."
  exit 1
fi

source .env

if [ -z "$HEDERA_ACCOUNT_ID" ] || [ -z "$HEDERA_PRIVATE_KEY" ]; then
  echo "ERROR: HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY must be set in .env"
  exit 1
fi

echo "Account: $HEDERA_ACCOUNT_ID"
echo ""

# Create HCS topic for memory anchoring
echo "[1/3] Creating HCS memory topic..."
/home/ai/.bun/bin/bun run src/hcs/create-topic.ts

echo ""
echo "[2/3] Running tests..."
/home/ai/.bun/bin/bun test --reporter=verbose 2>&1 | tail -20

echo ""
echo "[3/3] Starting API server..."
/home/ai/.bun/bin/bun run src/api/serve.ts &
SERVER_PID=$!
sleep 3

echo "Verifying /health endpoint..."
curl -s http://localhost:${PORT:-3000}/health | python3 -m json.tool

echo ""
echo "=== Deployment complete ==="
echo "Server PID: $SERVER_PID"
echo "Kill with: kill $SERVER_PID"
