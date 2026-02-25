#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Generating Android app icons...${NC}\n"

# Check for inkscape (preferred) or rsvg-convert as fallback
if command -v inkscape &> /dev/null; then
    SVG_RENDERER="inkscape"
elif command -v rsvg-convert &> /dev/null; then
    SVG_RENDERER="rsvg"
elif command -v magick &> /dev/null || command -v convert &> /dev/null; then
    SVG_RENDERER="imagemagick"
    echo -e "${YELLOW}Using ImageMagick for SVG rendering (inkscape/rsvg-convert not found)${NC}"
else
    echo -e "${YELLOW}Error: no SVG renderer found. Please install inkscape, rsvg-convert, or ImageMagick.${NC}"
    echo "On Fedora/RHEL: sudo dnf install inkscape"
    echo "On Ubuntu/Debian: sudo apt-get install inkscape"
    exit 1
fi

# Check if ImageMagick is installed (needed for compositing).
# ImageMagick 7+ uses `magick`; ImageMagick 6 (Ubuntu/Debian) uses `convert`.
if command -v magick &> /dev/null; then
    MAGICK="magick"
elif command -v convert &> /dev/null; then
    MAGICK="convert"
else
    echo -e "${YELLOW}Warning: ImageMagick not found. Please install it to generate icons.${NC}"
    echo "On Fedora/RHEL: sudo dnf install ImageMagick"
    echo "On Ubuntu/Debian: sudo apt-get install imagemagick"
    exit 1
fi

# Source SVG logo
SOURCE_SVG="public/logo.svg"

if [ ! -f "$SOURCE_SVG" ]; then
    echo -e "${YELLOW}Error: Source logo not found at $SOURCE_SVG${NC}"
    exit 1
fi

# Brand colors
BG_COLOR="#7c52e0"   # Ditto purple

TMPDIR=$(mktemp -d)
LOGO_WHITE_SVG="$TMPDIR/logo_white.svg"
LOGO_WHITE="$TMPDIR/logo_white.png"

# Recolor the SVG fill to white before rasterizing.
sed 's/#7c52e0/#ffffff/g' "$SOURCE_SVG" > "$LOGO_WHITE_SVG"

echo "Rendering white SVG at 512x512..."

if [ "$SVG_RENDERER" = "inkscape" ]; then
    inkscape --export-type=png --export-filename="$LOGO_WHITE" -w 512 -h 512 "$LOGO_WHITE_SVG" 2>/dev/null
elif [ "$SVG_RENDERER" = "rsvg" ]; then
    rsvg-convert -w 512 -h 512 "$LOGO_WHITE_SVG" -o "$LOGO_WHITE"
else
    # Use ImageMagick
    $MAGICK "$LOGO_WHITE_SVG" -resize 512x512 -background none -flatten "$LOGO_WHITE"
fi

# ── Legacy launcher icons (pre-Android 8.0) ──
# For devices < API 26, generate full icons with purple background + white logo

echo "Generating legacy launcher PNGs (ic_launcher.png, ic_launcher_round.png)..."

make_legacy_icon() {
    local size=$1
    local content_size=$((size * 50 / 100))
    local dest=$2
    local round=$3
    
    if [ "$round" = "round" ]; then
        # Round icon with circular mask
        $MAGICK -size "${size}x${size}" "xc:${BG_COLOR}" \
            \( -size "${size}x${size}" xc:black -fill white -draw "circle $((size/2)),$((size/2)) $((size/2)),0" \) \
            -alpha off -compose copy_opacity -composite \
            \( "$LOGO_WHITE" -resize "${content_size}x${content_size}" \) \
            -gravity center -compose over -composite \
            "$dest"
    else
        # Square icon
        $MAGICK -size "${size}x${size}" "xc:${BG_COLOR}" \
            \( "$LOGO_WHITE" -resize "${content_size}x${content_size}" \) \
            -gravity center -compose over -composite \
            "$dest"
    fi
}

make_legacy_icon 48  android/app/src/main/res/mipmap-mdpi/ic_launcher.png
make_legacy_icon 48  android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png round
make_legacy_icon 72  android/app/src/main/res/mipmap-hdpi/ic_launcher.png
make_legacy_icon 72  android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png round
make_legacy_icon 96  android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
make_legacy_icon 96  android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png round
make_legacy_icon 144 android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
make_legacy_icon 144 android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png round
make_legacy_icon 192 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
make_legacy_icon 192 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png round

# ── Adaptive icon foreground PNGs (transparent bg, white logo, safe-zone padding) ──
# For Android 8.0+ (API 26+) adaptive icons

echo "Generating adaptive foreground PNGs..."

make_foreground() {
    local size=$1
    local content_size=$((size * 50 / 100))
    local dest=$2
    $MAGICK -size "${size}x${size}" "xc:none" \
        \( "$LOGO_WHITE" -resize "${content_size}x${content_size}" \) \
        -gravity center -compose over -composite \
        "$dest"
}

make_foreground 48  android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png
make_foreground 72  android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png
make_foreground 96  android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png
make_foreground 144 android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png
make_foreground 192 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png

# Update background color
BACKGROUND_COLOR_FILE="android/app/src/main/res/values/ic_launcher_background.xml"
mkdir -p android/app/src/main/res/values
cat > "$BACKGROUND_COLOR_FILE" << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#7c52e0</color>
</resources>
EOF

# Cleanup temp files
rm -rf "$TMPDIR"

echo -e "\n${GREEN}Android icons generated successfully!${NC}"
echo -e "Icon: white Ditto logo on ${GREEN}${BG_COLOR}${NC} (Ditto purple)"
