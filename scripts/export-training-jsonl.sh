#!/usr/bin/env bash
# Stream training examples out of a deployed (or local) instance as JSONL.
#
# Usage:
#   ./scripts/export-training-jsonl.sh --base-url http://localhost:8080 > examples.jsonl
#   ./scripts/export-training-jsonl.sh --base-url https://your-frontend --dataset <id> > examples.jsonl

set -euo pipefail

BASE_URL=""
DATASET=""

usage() {
  cat <<USAGE
Usage: $0 --base-url <url> [--dataset <id>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url) BASE_URL="$2"; shift 2 ;;
    --dataset) DATASET="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown flag: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$BASE_URL" ]]; then
  usage
  exit 1
fi

BASE_URL="${BASE_URL%/}"
PATH_QS="/api/training/export.jsonl"
if [[ -n "$DATASET" ]]; then
  PATH_QS="${PATH_QS}?datasetId=${DATASET}"
fi

curl --fail -sS "$BASE_URL$PATH_QS"
