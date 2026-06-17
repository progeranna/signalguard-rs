#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"

get() {
  local label="$1"
  local path="$2"

  printf '\n== %s ==\n' "$label"
  curl --fail --silent --show-error "${BASE_URL}${path}"
  printf '\n'
}

get "GET /health" "/health"
get "GET /pipeline/health" "/pipeline/health"
get "GET /symbols" "/symbols"
get "GET /market/BTCUSDT/state" "/market/BTCUSDT/state"
get "GET /market/BTCUSDT/health" "/market/BTCUSDT/health"
get "GET /anomalies?symbol=BTCUSDT&limit=50" "/anomalies?symbol=BTCUSDT&limit=50"

printf '\n== GET /metrics (selected SignalGuard metrics) ==\n'
curl --fail --silent --show-error "${BASE_URL}/metrics" \
  | grep -E '^(# (HELP|TYPE) )?(signalguard_events_processed_total|signalguard_parse_errors_total|signalguard_storage_errors_total|signalguard_cache_errors_total|signalguard_last_message_age_ms)' \
  | head -n 40
