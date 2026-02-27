#!/bin/sh
set -e

case "$1" in
  serve)
    exec bun run src/serve.ts
    ;;
  smoke)
    exec bun run src/smoke.ts
    ;;
  *)
    echo "Usage: docker run IMAGE [serve|smoke]"
    echo ""
    echo "Commands:"
    echo "  serve  Start MCP server on port 8000 (/mcp + /health)"
    echo "  smoke  Run quick health check and exit"
    exit 1
    ;;
esac
