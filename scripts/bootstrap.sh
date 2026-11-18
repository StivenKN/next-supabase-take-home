#!/usr/bin/env bash
# One command from a fresh clone (or a new T3 Code worktree) to a runnable app:
# checks Node, pnpm and Docker, installs dependencies, starts local Supabase and
# writes .env.local. Safe to re-run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() {
  echo "error: $*" >&2
  exit 1
}

required_node="$(tr -d '[:space:]v' < .nvmrc)"
required_pnpm=10

command -v node >/dev/null 2>&1 ||
  fail "Node.js ${required_node} or later is required: https://nodejs.org/en/download"
node_major="$(node -p 'process.versions.node.split(".")[0]')"
((node_major >= required_node)) ||
  fail "Node.js ${required_node} or later is required (found $(node --version))."

command -v pnpm >/dev/null 2>&1 ||
  fail "pnpm ${required_pnpm} or later is required: https://pnpm.io/installation"
pnpm_major="$(pnpm --version | cut -d. -f1)"
((pnpm_major >= required_pnpm)) ||
  fail "pnpm ${required_pnpm} or later is required (found $(pnpm --version))."

command -v docker >/dev/null 2>&1 ||
  fail "Docker is required for local Supabase: https://docs.docker.com/get-docker/"
docker info >/dev/null 2>&1 ||
  fail "Docker is installed but not running. Start Docker, then run pnpm bootstrap again."

pnpm install --frozen-lockfile

# Starts Supabase (a no-op if it is already running) and writes .env.local.
bash scripts/setup-env.sh

echo
echo "Ready. Run pnpm dev and open http://localhost:3000"
