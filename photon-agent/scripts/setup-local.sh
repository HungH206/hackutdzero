#!/usr/bin/env bash
# Publishes the module to a local SpacetimeDB and makes an operator identity for the agent.
# Needs `spacetime start` running. Writes SPACETIME_TOKEN into .env (gitignored).
set -euo pipefail
cd "$(dirname "$0")/.."
URL="${SPACETIME_URL:-http://127.0.0.1:3000}"
DB="${SPACETIME_DB:-headcount}"
spacetime publish --server local --module-path ../spacetimedb --delete-data=never -y "$DB"
RESPONSE=$(curl -sf -X POST "$URL/v1/identity")
IDENTITY=$(node -pe "JSON.parse(process.argv[1]).identity" "$RESPONSE")
TOKEN=$(node -pe "JSON.parse(process.argv[1]).token" "$RESPONSE")
spacetime call --server local -y "$DB" add_operator "{\"__identity__\":\"0x$IDENTITY\"}"
[ -f .env ] || cp .env.example .env
if grep -q '^SPACETIME_TOKEN=' .env; then
  sed -i '' "s|^SPACETIME_TOKEN=.*|SPACETIME_TOKEN=$TOKEN|" .env
else
  echo "SPACETIME_TOKEN=$TOKEN" >> .env
fi
echo "Agent identity added as an operator."
