#!/usr/bin/env bash
# Overlay the sidebar source into the upstream monorepo as the browser-extension
# workspace package, so pnpm resolves @karakeep/* deps against pristine upstream.
# ponytail: copy, not symlink — a symlinked target outside the upstream tree escapes
# pnpm/tsc node_modules resolution (@types/chrome won't resolve). Copy keeps the
# package's real path inside the workspace, which is what the toolchain needs.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -e "$root/upstream/package.json" ]; then
  echo "::error::upstream submodule not checked out. Run: git submodule update --init" >&2
  exit 1
fi

rm -rf "$root/upstream/apps/browser-extension"
cp -R "$root/extension" "$root/upstream/apps/browser-extension"
echo "overlaid extension/ -> upstream/apps/browser-extension"
