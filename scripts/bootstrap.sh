#!/usr/bin/env bash
# One command from a fresh clone (or a new T3 Code worktree) to a runnable app:
# checks Node and pnpm, installs dependencies, then checks Docker, starts local
# Supabase and writes .env.local. Safe to re-run.
#
# --continue-without-supabase: if Docker is not running or Supabase fails to
# start, warn and exit 0 after installing instead of failing. T3 Code's Setup
# action uses it, because a failing Setup stops the new thread's agent from
# starting at all.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

continue_without_supabase=false
for arg in "$@"; do
  case "$arg" in
    --continue-without-supabase) continue_without_supabase=true ;;
    --) ;;
    *)
      echo "error: unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

fail() {
  echo "error: $*" >&2
  exit 1
}

required_node="$(tr -d '[:space:]v' < .nvmrc)"
required_node="${required_node%%.*}"
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

pnpm install --frozen-lockfile

docker_problem=""
if ! command -v docker >/dev/null 2>&1; then
  docker_problem="Docker is required for local Supabase: https://docs.docker.com/get-docker/"
elif ! docker info >/dev/null 2>&1; then
  docker_problem="Docker is installed but not reachable (is the daemon running, and can this user access it?)."
fi

if [[ -n "$docker_problem" ]]; then
  if [[ "$continue_without_supabase" == true ]]; then
    echo "warning: ${docker_problem} Dependencies are installed; Supabase and .env.local were skipped." >&2
    echo "warning: Fix that, then run pnpm setup:env." >&2
    exit 0
  fi
  fail "${docker_problem} Fix that, then run pnpm bootstrap again."
fi

# Starts Supabase (a no-op if it is already running) and writes .env.local.
if ! bash scripts/setup-env.sh; then
  if [[ "$continue_without_supabase" == true ]]; then
    echo "warning: Supabase did not start (see above). Dependencies are installed; .env.local may be missing." >&2
    echo "warning: Fix the problem, then run pnpm setup:env." >&2
    exit 0
  fi
  exit 1
fi

echo
echo "Ready. Run pnpm dev and open the URL Next.js prints."
