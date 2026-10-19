#!/bin/bash
# Gives the Safari "Add to Dock" Slate web app a see-through, layered icon.
#
# Safari bakes web-app icons onto a white tile, which sticks out in a Dark,
# Clear or Tinted Dock. This swaps in a real macOS 26+ icon (Assets.car): no
# tile of its own, so the system draws the same background every other app
# gets, and the slabs turn to glass in Clear and Tinted modes.
#
# Double-click it after "File → Add to Dock…" in Safari. Re-run it if you ever
# remove Slate from the Dock and add it again (Safari rebuilds the app then).
# Needs no Xcode: Assets.car ships prebuilt. With Xcode installed it rebuilds
# from AppIcon.icon so edits to the icon take effect.
set -euo pipefail
cd "$(dirname "$0")"

# Installs from before the rename are called Cairn.app.
APP="${1:-}"
if [ -z "$APP" ]; then
  APP="$HOME/Applications/Slate.app"
  [ -d "$APP" ] || APP="$HOME/Applications/Cairn.app"
fi
PLIST="$APP/Contents/Info.plist"
if [ ! -f "$PLIST" ]; then
  echo "Couldn't find Slate at $APP."
  echo "Open Slate in Safari and choose File → Add to Dock… first, then run this again."
  exit 1
fi

CAR="Assets.car"
if xcrun --find actool >/dev/null 2>&1; then
  WORK="$(mktemp -d)"
  trap 'rm -rf "$WORK"' EXIT
  xcrun actool AppIcon.icon --compile "$WORK" \
    --output-format human-readable-text --errors --output-partial-info-plist "$WORK/partial.plist" \
    --app-icon AppIcon --include-all-app-icons --enable-on-demand-resources NO --development-region en \
    --target-device mac --minimum-deployment-target 14.0 --platform macosx >/dev/null
  CAR="$WORK/Assets.car"
fi

# Assets.car + CFBundleIconName is what macOS reads for the layered icon; Safari's
# ApplicationIcon.icns stays as the fallback for older systems.
cp "$CAR" "$APP/Contents/Resources/Assets.car"
/usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :CFBundleIconName string AppIcon" "$PLIST"

# Safari signs the web app ad hoc; re-sign with the same identifier so it still opens.
ID="$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$PLIST")"
codesign --force --sign - --identifier "$ID" "$APP"

touch "$APP"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP"
# The Dock keeps its own icon cache and won't redraw the old tile otherwise.
rm -f "$(getconf DARWIN_USER_CACHE_DIR)com.apple.dock.iconcache"
killall Dock

echo "✓ See-through icon applied to $APP"
