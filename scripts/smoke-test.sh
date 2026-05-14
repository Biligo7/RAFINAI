#!/usr/bin/env bash
# End-to-end smoke test against a deployed (or local) frontend URL.
# Verifies health, config, chat creation, and SSE streaming.

set -euo pipefail

URL=""
TIMEOUT="${TIMEOUT:-120}"

usage() {
  cat <<USAGE
Usage: $0 --url <https://frontend-url> [--timeout <seconds>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) URL="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown flag: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$URL" ]]; then
  usage
  exit 1
fi

URL="${URL%/}"

echo "==> $URL/healthz"
curl --max-time "$TIMEOUT" --retry 12 --retry-delay 5 --retry-all-errors --fail "$URL/healthz" >/dev/null
echo "    OK"

echo "==> $URL/api/config"
CONFIG=$(curl --max-time "$TIMEOUT" --retry 12 --retry-delay 5 --retry-all-errors --fail "$URL/api/config")
echo "    $CONFIG"

echo "==> POST $URL/api/chats"
CHAT=$(curl --max-time "$TIMEOUT" --fail -sS \
  -H "content-type: application/json" \
  -d '{"title":"smoke-test"}' \
  "$URL/api/chats")
CHAT_ID=$(printf '%s' "$CHAT" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
if [[ -z "$CHAT_ID" ]]; then
  echo "    ERROR: failed to extract chat id from response: $CHAT" >&2
  exit 1
fi
echo "    chat id $CHAT_ID"

echo "==> POST $URL/api/chats/$CHAT_ID/messages (SSE)"
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
curl --max-time "$TIMEOUT" --fail -sSN \
  -H "content-type: application/json" \
  -H "accept: text/event-stream" \
  -d '{"content":"hello from smoke test"}' \
  "$URL/api/chats/$CHAT_ID/messages" > "$TMP"

if grep -q "^event: done" "$TMP"; then
  echo "    received done event"
else
  echo "    ERROR: stream did not include a done event" >&2
  cat "$TMP" >&2
  exit 1
fi

echo "Smoke tests passed."
