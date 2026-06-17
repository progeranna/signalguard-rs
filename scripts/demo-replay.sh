#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
DATABASE_URL="${DATABASE_URL:-postgres://signalguard:signalguard@localhost:5432/signalguard}"
REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
SERVICE_LOG="$(mktemp)"
SERVICE_PID=""
COMPOSE_STARTED=0

cleanup() {
  if [[ -n "${SERVICE_PID}" ]] && kill -0 "${SERVICE_PID}" 2>/dev/null; then
    printf '\nStopping SignalGuard service (pid %s)\n' "${SERVICE_PID}"
    kill "${SERVICE_PID}" 2>/dev/null || true
    wait "${SERVICE_PID}" 2>/dev/null || true
  fi

  if [[ "${COMPOSE_STARTED}" == "1" ]]; then
    if [[ "${DEMO_DOWN:-0}" == "1" ]]; then
      printf '\nDEMO_DOWN=1: stopping Docker dependencies\n'
      docker compose down
    else
      printf '\nPostgreSQL and Redis are still running. Use `docker compose down` to stop them.\n'
    fi
  fi

  rm -f "${SERVICE_LOG}"
}
trap cleanup EXIT

require_command() {
  local command="$1"

  if ! command -v "${command}" >/dev/null 2>&1; then
    printf 'required command not found: %s\n' "${command}" >&2
    exit 1
  fi
}

wait_for_health() {
  local attempts=60

  for _ in $(seq 1 "${attempts}"); do
    if curl --fail --silent --show-error "${BASE_URL}/health" >/dev/null 2>&1; then
      return 0
    fi

    if ! kill -0 "${SERVICE_PID}" 2>/dev/null; then
      printf 'SignalGuard service exited before /health became available.\n' >&2
      printf 'Service log:\n' >&2
      tail -n 80 "${SERVICE_LOG}" >&2 || true
      exit 1
    fi

    sleep 1
  done

  printf 'timed out waiting for %s/health\n' "${BASE_URL}" >&2
  printf 'Service log:\n' >&2
  tail -n 80 "${SERVICE_LOG}" >&2 || true
  exit 1
}

run_migrations() {
  local attempts=30

  for attempt in $(seq 1 "${attempts}"); do
    if sqlx migrate run; then
      return 0
    fi

    if [[ "${attempt}" == "${attempts}" ]]; then
      printf 'sqlx migrations did not complete after %s attempts\n' "${attempts}" >&2
      exit 1
    fi

    sleep 1
  done
}

cd "${REPO_ROOT}"

require_command cargo
require_command docker
require_command sqlx
require_command curl

if ! docker compose version >/dev/null 2>&1; then
  printf 'required command failed: docker compose version\n' >&2
  exit 1
fi

printf 'Starting PostgreSQL and Redis with Docker Compose\n'
docker compose up -d postgres redis
COMPOSE_STARTED=1

export DATABASE_URL
export REDIS_URL
export SIGNALGUARD_DATABASE_URL="${SIGNALGUARD_DATABASE_URL:-${DATABASE_URL}}"
export SIGNALGUARD_REDIS_URL="${SIGNALGUARD_REDIS_URL:-${REDIS_URL}}"
export SIGNALGUARD_INGESTION_MODE=replay
export SIGNALGUARD_INGESTION_REPLAY_PATH=examples/replay/sample.jsonl
export SIGNALGUARD_REPLAY_RESET_STORAGE=true

printf '\nRunning database migrations\n'
run_migrations

printf '\nStarting SignalGuard replay service\n'
cargo run >"${SERVICE_LOG}" 2>&1 &
SERVICE_PID="$!"

printf 'Waiting for /health at %s\n' "${BASE_URL}"
wait_for_health

printf '\nRunning smoke checks\n'
BASE_URL="${BASE_URL}" bash scripts/smoke.sh

printf '\nDemo replay completed successfully.\n'
