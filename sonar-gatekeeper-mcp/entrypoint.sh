#!/bin/sh
case "$1" in
  smoke)
    exec bun run src/smoke.ts
    ;;
  serve)
    exec bun run src/serve.ts
    ;;
  *)
    exec bun run src/index.ts "$@"
    ;;
esac
