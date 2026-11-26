#!/usr/bin/env bash
# Runs every browser test against `vite preview` on :4173. Usage: npm run build && (npx vite preview --port 4173 &) && bash e2e/run-all.sh
set -u; cd "$(dirname "$0")"; fail=0
for t in smoke a11y core phase2 phase3 receipts heic reports backup-sync-pwa keyboard; do
  printf '\n=== %s ===\n' "$t"; if node "$t.cjs"; then echo "PASS $t"; else echo "FAIL $t"; fail=1; fi
done
printf '\n=== performance (informational) ===\n'; N=10000 node perf-navigation.cjs || true
exit $fail
