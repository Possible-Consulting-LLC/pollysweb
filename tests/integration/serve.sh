#!/usr/bin/env bash
# Serves the integration suite's own production build on loopback :43901.
# Dev-server timings are invalid (compile-on-demand + recompiles while editing)
# — documented in the performance report — so the suite always verifies and
# measures against `next start` over a webpack production build.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ "${PW_FORCE_BUILD:-0}" = "1" ] || [ ! -f .next/BUILD_ID ]; then
  npm run build -- --webpack
fi

exec npx next start -p 43901