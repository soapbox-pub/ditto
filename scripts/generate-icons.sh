#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🎨 Generating Android app icons...${NC}\n"

# Check if ImageMagick is installed
if ! command -v magick &> /dev/null; then
    echo -e "${YELLOW}Warning: ImageMagick not found. Please install it to generate icons.${NC}"
    echo "On Fedora/RHEL: sudo dnf install ImageMagick"
    echo "On Ubuntu/Debian: sudo apt-get install imagemagick"
    exit 1
fi

# Source icon
SOURCE_ICON="public/icon-512.png"

if [ ! -f "$SOURCE_ICON" ]; then
    echo -e "${YELLOW}Error: Source icon not found at $SOURCE_ICON${NC}"
    exit 1
fi

# Create Android resource directories if they don't exist
mkdir -p android/app/src/main/res/{mipmap-mdpi,mipmap-hdpi,mipmap-xhdpi,mipmap-xxhdpi,mipmap-xxxhdpi}

# Generate icons for each density
# Note: Foreground images need padding for Android adaptive icons (safe zone = 66% of canvas)
# The icon content should be scaled to ~66% and centered with transparent padding

echo "Generating mdpi icons (48x48)..."
magick "$SOURCE_ICON" -resize 48x48 android/app/src/main/res/mipmap-mdpi/ic_launcher.png
magick "$SOURCE_ICON" -resize 48x48 android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png
magick "$SOURCE_ICON" -resize 30x30 -background none -gravity center -extent 48x48 android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png

echo "Generating hdpi icons (72x72)..."
magick "$SOURCE_ICON" -resize 72x72 android/app/src/main/res/mipmap-hdpi/ic_launcher.png
magick "$SOURCE_ICON" -resize 72x72 android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png
magick "$SOURCE_ICON" -resize 46x46 -background none -gravity center -extent 72x72 android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png

echo "Generating xhdpi icons (96x96)..."
magick "$SOURCE_ICON" -resize 96x96 android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
magick "$SOURCE_ICON" -resize 96x96 android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png
magick "$SOURCE_ICON" -resize 62x62 -background none -gravity center -extent 96x96 android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png

echo "Generating xxhdpi icons (144x144)..."
magick "$SOURCE_ICON" -resize 144x144 android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
magick "$SOURCE_ICON" -resize 144x144 android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png
magick "$SOURCE_ICON" -resize 92x92 -background none -gravity center -extent 144x144 android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png

echo "Generating xxxhdpi icons (192x192)..."
magick "$SOURCE_ICON" -resize 192x192 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
magick "$SOURCE_ICON" -resize 192x192 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png
magick "$SOURCE_ICON" -resize 122x122 -background none -gravity center -extent 192x192 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png

# Update icon background color
BACKGROUND_COLOR_FILE="android/app/src/main/res/values/ic_launcher_background.xml"
mkdir -p android/app/src/main/res/values
cat > "$BACKGROUND_COLOR_FILE" << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#ffffff</color>
</resources>
EOF

echo -e "\n${GREEN}✅ Android icons generated successfully!${NC}"
echo -e "Icon background color: ${GREEN}#ffffff${NC}"
