#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔨 Ditto APK Builder (Secure)${NC}\n"

# CalVer date prefix (full tag determined after commit)
DATE_TAG="v$(date +%Y.%m.%d)"
echo -e "This build date: ${GREEN}${DATE_TAG}${NC}\n"

# Check/create Android SDK local.properties
if [ ! -f "android/local.properties" ]; then
  echo -e "${YELLOW}⚠️  android/local.properties not found${NC}"
  
  if [ -n "$ANDROID_HOME" ]; then
    echo -e "${GREEN}✓ Using ANDROID_HOME: $ANDROID_HOME${NC}"
    echo "sdk.dir=$ANDROID_HOME" > android/local.properties
  elif [ -n "$ANDROID_SDK_ROOT" ]; then
    echo -e "${GREEN}✓ Using ANDROID_SDK_ROOT: $ANDROID_SDK_ROOT${NC}"
    echo "sdk.dir=$ANDROID_SDK_ROOT" > android/local.properties
  else
    echo -e "${RED}❌ Android SDK location not configured!${NC}"
    echo -e "${YELLOW}Please set ANDROID_HOME environment variable or create android/local.properties manually${NC}"
    echo -e "\nExample android/local.properties:"
    echo -e "  sdk.dir=/path/to/android-sdk"
    echo ""
    exit 1
  fi
fi

# Check if keystore exists
if [ ! -f "android/app/my-upload-key.keystore" ]; then
  echo -e "${RED}❌ Keystore not found!${NC}"
  echo -e "${YELLOW}Please create a keystore first:${NC}"
  echo -e "  ./scripts/create-keystore.sh"
  echo ""
  echo -e "${YELLOW}Or see KEYSTORE_SETUP.md for manual setup${NC}"
  exit 1
fi

# Check if key.properties exists
if [ ! -f "android/key.properties" ]; then
  echo -e "${RED}❌ key.properties not found!${NC}"
  echo -e "${YELLOW}Please create android/key.properties with:${NC}"
  echo ""
  echo "storePassword=YOUR_KEYSTORE_PASSWORD"
  echo "keyPassword=YOUR_KEY_PASSWORD"
  echo "keyAlias=upload"
  echo "storeFile=my-upload-key.keystore"
  echo ""
  exit 1
fi

VERSION_CODE=$(date +%Y%m%d)
VERSION_NAME=$(date +%Y.%m.%d)

echo -e "${BLUE}Step 1/7:${NC} Syncing version to build.gradle..."
echo -e "  versionCode: ${GREEN}${VERSION_CODE}${NC}"
echo -e "  versionName: ${GREEN}${VERSION_NAME}${NC}"
sed -i "s/versionCode [0-9]*/versionCode ${VERSION_CODE}/" android/app/build.gradle
sed -i "s/versionName \"[^\"]*\"/versionName \"${VERSION_NAME}\"/" android/app/build.gradle

echo -e "\n${BLUE}Step 2/7:${NC} Building web assets..."
npm run build

echo -e "\n${BLUE}Step 3/7:${NC} Generating Android icons..."
bash scripts/generate-icons.sh

echo -e "\n${BLUE}Step 4/7:${NC} Syncing to Capacitor..."
npx cap sync android

echo -e "\n${BLUE}Step 5/7:${NC} Building signed release APK..."
cd android && ./gradlew assembleRelease && cd ..

APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
APK_SIZE=$(ls -lh "$APK_PATH" | awk '{print $5}')

echo -e "\n${BLUE}Step 6/7:${NC} Committing build..."
git add android/app/build.gradle
git commit -m "Build ${DATE_TAG}: ditto.apk (${APK_SIZE})"

# Determine the final tag with the commit hash
SHORT_HASH=$(git rev-parse --short HEAD)
NEW_TAG="${DATE_TAG}+${SHORT_HASH}"

echo -e "\n${BLUE}Step 7/7:${NC} Tagging and pushing..."
git tag -a "${NEW_TAG}" -m "Build ${NEW_TAG}"
git push origin main
git push origin "${NEW_TAG}"

echo -e "\n${GREEN}✅ APK built and pushed as ${NEW_TAG}!${NC}"
echo -e "Location: ${GREEN}${APK_PATH}${NC}"
echo -e "Size: ${GREEN}${APK_SIZE}${NC}"
echo -e "Version: ${GREEN}${NEW_TAG}${NC}"
echo -e "\n${BLUE}Next steps:${NC}"
echo -e "  1. Test the APK on a device"
echo -e "  2. Deploy to your preferred distribution channel"
echo ""
