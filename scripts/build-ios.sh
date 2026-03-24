#!/bin/bash
set -e

# Remote iOS build script
# Builds the iOS app on a Mac Mini over SSH from any machine (e.g., Linux laptop).
#
# Usage:
#   ./scripts/build-ios.sh                  # Sync, build web, cap sync, xcodebuild (simulator)
#   ./scripts/build-ios.sh --device         # Build for physical device (unsigned)
#   ./scripts/build-ios.sh --skip-sync      # Skip rsync (already synced)
#   ./scripts/build-ios.sh --archive        # Build a signed .xcarchive
#   ./scripts/build-ios.sh --open           # Open Xcode project on Mac after sync
#
# Prerequisites:
#   - SSH access to the Mac Mini: ssh alex@orcus.lan
#   - Xcode installed on the Mac Mini (with iOS simulator runtime)
#   - Node.js 22 on the Mac Mini (via Homebrew)

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
REMOTE_HOST="alex@orcus.lan"
REMOTE_DIR="~/Projects/ditto"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Parse arguments
SKIP_SYNC=false
ARCHIVE=false
DEVICE=false
OPEN_XCODE=false
for arg in "$@"; do
  case $arg in
    --skip-sync) SKIP_SYNC=true ;;
    --archive) ARCHIVE=true ;;
    --device) DEVICE=true ;;
    --open) OPEN_XCODE=true ;;
    *) echo -e "${RED}Unknown argument: $arg${NC}"; exit 1 ;;
  esac
done

# Verify SSH connectivity
echo -e "${GREEN}Checking SSH connection to ${REMOTE_HOST}...${NC}"
if ! ssh -o ConnectTimeout=5 "$REMOTE_HOST" "echo ok" > /dev/null 2>&1; then
  echo -e "${RED}Cannot connect to ${REMOTE_HOST}. Is the Mac Mini on?${NC}"
  exit 1
fi

# Step 1: Sync project files
if [ "$SKIP_SYNC" = false ]; then
  echo -e "\n${GREEN}[1/4] Syncing project to Mac Mini...${NC}"
  rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'dist' \
    --exclude 'android/build' \
    --exclude 'android/.gradle' \
    --exclude '*.keystore' \
    --exclude 'ios/App/build' \
    --exclude 'ios/App/Pods' \
    --exclude 'ios/DerivedData' \
    -e ssh \
    "$LOCAL_DIR/" "$REMOTE_HOST:$REMOTE_DIR/"
else
  echo -e "\n${YELLOW}[1/4] Skipping sync (--skip-sync)${NC}"
fi

# Step 2: Install dependencies and build web assets on Mac Mini
echo -e "\n${GREEN}[2/4] Building web assets on Mac Mini...${NC}"
ssh "$REMOTE_HOST" "
  export PATH=\"/opt/homebrew/bin:\$PATH\"
  cd $REMOTE_DIR
  npm install --silent
  npx vite build -l error
  cp dist/index.html dist/404.html
  echo 'Web build complete'
"

# Step 3: Capacitor sync
echo -e "\n${GREEN}[3/4] Running Capacitor sync for iOS...${NC}"
ssh "$REMOTE_HOST" "
  export PATH=\"/opt/homebrew/bin:\$PATH\"
  cd $REMOTE_DIR
  npx cap sync ios
"

# Step 4: Build or open
if [ "$OPEN_XCODE" = true ]; then
  echo -e "\n${GREEN}[4/4] Opening Xcode project on Mac Mini...${NC}"
  ssh "$REMOTE_HOST" "open $REMOTE_DIR/ios/App/App.xcodeproj"
  echo -e "\n${GREEN}Xcode project opened on ${REMOTE_HOST}${NC}"
elif [ "$ARCHIVE" = true ]; then
  echo -e "\n${GREEN}[4/4] Building iOS archive...${NC}"
  ssh "$REMOTE_HOST" "
    export PATH=\"/opt/homebrew/bin:\$PATH\"
    cd $REMOTE_DIR/ios/App
    xcodebuild archive \
      -scheme App \
      -archivePath build/App.xcarchive \
      -destination 'generic/platform=iOS' \
      CODE_SIGN_IDENTITY='-' \
      AD_HOC_CODE_SIGNING_ALLOWED=YES
  "
  echo -e "\n${GREEN}Archive built at: ${REMOTE_HOST}:${REMOTE_DIR}/ios/App/build/App.xcarchive${NC}"
elif [ "$DEVICE" = true ]; then
  echo -e "\n${GREEN}[4/4] Building iOS (device, unsigned)...${NC}"
  ssh "$REMOTE_HOST" "
    export PATH=\"/opt/homebrew/bin:\$PATH\"
    cd $REMOTE_DIR/ios/App
    xcodebuild build \
      -scheme App \
      -sdk iphoneos \
      -configuration Debug \
      CODE_SIGN_IDENTITY='' \
      CODE_SIGNING_REQUIRED=NO \
      CODE_SIGNING_ALLOWED=NO
  "
  echo -e "\n${GREEN}iOS device build complete!${NC}"
else
  echo -e "\n${GREEN}[4/4] Building iOS (simulator)...${NC}"
  # Find an available simulator
  SIMULATOR=\$(ssh "$REMOTE_HOST" "xcrun simctl list devices available -j 2>/dev/null | python3 -c \"
import json,sys
data=json.load(sys.stdin)
for runtime,devices in data.get('devices',{}).items():
  if 'iOS' in runtime:
    for d in devices:
      if d.get('isAvailable') and 'iPhone' in d.get('name',''):
        print(d['name']); sys.exit(0)
print('iPhone 16')
\"" 2>/dev/null || echo "iPhone 16")

  echo "Using simulator: $SIMULATOR"
  ssh "$REMOTE_HOST" "
    export PATH=\"/opt/homebrew/bin:\$PATH\"
    cd $REMOTE_DIR/ios/App
    xcodebuild build \
      -scheme App \
      -destination 'platform=iOS Simulator,name=$SIMULATOR' \
      -configuration Debug \
      CODE_SIGN_IDENTITY='-' \
      CODE_SIGNING_ALLOWED=NO
  "
  echo -e "\n${GREEN}iOS simulator build complete!${NC}"
fi

echo -e "\n${GREEN}Done!${NC}"
