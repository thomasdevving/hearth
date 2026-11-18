#!/bin/sh
# Build phase: copies the engine bundle, shared/ and the fonts into the app (mode "app"),
# or the golden fixtures into the test bundle (mode "tests"). Nothing here is committed twice:
# the sources of truth stay in packages/engine, shared/ and node_modules.
set -e
MODE="$1"
REPO="${SRCROOT}/../.."
DEST="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if [ "$MODE" = "tests" ]; then
  mkdir -p "$DEST/fixtures"
  rm -f "$DEST/fixtures/"*.json
  cp "$REPO/packages/engine/test/fixtures/"*.json "$DEST/fixtures/"
  exit 0
fi

ENGINE="$REPO/packages/engine/dist/engine.js"
# Rebuild the engine bundle when it is missing or older than the engine source or shared/.
if [ ! -f "$ENGINE" ] || [ -n "$(find "$REPO/packages/engine/src" "$REPO/shared" -newer "$ENGINE" -type f | head -1)" ]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "error: packages/engine/dist/engine.js is missing or stale and npm is not installed. Run: npm ci && npm run build -w packages/engine" >&2
    exit 1
  fi
  if [ ! -d "$REPO/node_modules" ]; then (cd "$REPO" && npm ci); fi
  (cd "$REPO" && npm run build -w packages/engine)
fi

mkdir -p "$DEST/Engine" "$DEST/Fonts"
cp "$ENGINE" "$DEST/Engine/engine.js"
cp "$SRCROOT/Hearth/Engine/v8math.js" "$DEST/Engine/v8math.js"
rm -rf "$DEST/shared"
cp -R "$REPO/shared" "$DEST/shared"
for f in "syne/files/syne-latin-wght-normal.woff2" "outfit/files/outfit-latin-wght-normal.woff2"; do
  SRC="$REPO/node_modules/@fontsource-variable/$f"
  if [ ! -f "$SRC" ]; then
    echo "error: $SRC missing. Run npm ci at the repository root." >&2
    exit 1
  fi
  cp "$SRC" "$DEST/Fonts/"
done
