#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Generating app icons...${NC}\n"

# Check for inkscape (preferred) or rsvg-convert as fallback
if command -v inkscape &> /dev/null; then
    SVG_RENDERER="inkscape"
elif command -v rsvg-convert &> /dev/null; then
    SVG_RENDERER="rsvg"
else
    echo -e "${YELLOW}Warning: neither inkscape nor rsvg-convert found. Install one to render SVG icons.${NC}"
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
else
    rsvg-convert -w 512 -h 512 "$LOGO_WHITE_SVG" -o "$LOGO_WHITE"
fi

# ── Adaptive icon foreground PNGs (transparent bg, white logo, safe-zone padding) ──
# Content at 47% of canvas to fit within Android's adaptive icon safe zone.

echo "Generating adaptive foreground PNGs..."

make_foreground() {
    local size=$1
    local content_size=$(echo "$size * 47 / 100" | bc)
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

# ── Legacy launcher icons (ic_launcher.png and ic_launcher_round.png) ──
# These are used on pre-API-26 devices and as fallback on some launchers.
# They must have the logo composited onto the purple background — NOT just
# a solid color fill.

echo "Generating legacy launcher icons (ic_launcher.png and ic_launcher_round.png)..."

# make_legacy_square: logo on flat purple square background
make_legacy_square() {
    local size=$1
    local content_size=$(echo "$size * 60 / 100" | bc)
    local dest=$2
    $MAGICK -size "${size}x${size}" "xc:${BG_COLOR}" \
        \( "$LOGO_WHITE" -resize "${content_size}x${content_size}" \) \
        -gravity center -compose over -composite \
        "$dest"
}

# make_legacy_round: logo on circular purple background (alpha-masked circle)
make_legacy_round() {
    local size=$1
    local content_size=$(echo "$size * 60 / 100" | bc)
    local dest=$2
    local mask="$TMPDIR/circle_mask_${size}.png"
    # Create a white circle mask
    $MAGICK -size "${size}x${size}" "xc:none" \
        -fill white -draw "circle $((size/2)),$((size/2)) $((size/2)),0" \
        "$mask"
    # Fill purple, apply circle mask, composite logo
    $MAGICK -size "${size}x${size}" "xc:${BG_COLOR}" \
        "$mask" -compose dst-in -composite \
        \( "$LOGO_WHITE" -resize "${content_size}x${content_size}" \) \
        -gravity center -compose over -composite \
        "$dest"
}

make_legacy_square 48  android/app/src/main/res/mipmap-mdpi/ic_launcher.png
make_legacy_square 72  android/app/src/main/res/mipmap-hdpi/ic_launcher.png
make_legacy_square 96  android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
make_legacy_square 144 android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
make_legacy_square 192 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png

make_legacy_round 48  android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png
make_legacy_round 72  android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png
make_legacy_round 96  android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png
make_legacy_round 144 android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png
make_legacy_round 192 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png

# Update background color
BACKGROUND_COLOR_FILE="android/app/src/main/res/values/ic_launcher_background.xml"
mkdir -p android/app/src/main/res/values
cat > "$BACKGROUND_COLOR_FILE" << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#7c52e0</color>
</resources>
EOF

# ── iOS App Icon (1024x1024, white logo on purple background) ──

echo "Generating iOS app icon..."

IOS_ICON_DIR="ios/App/App/Assets.xcassets/AppIcon.appiconset"

if [ -d "$IOS_ICON_DIR" ]; then
    IOS_ICON="$IOS_ICON_DIR/AppIcon-512@2x.png"
    # Logo at ~60% of canvas, centered on purple background (matches legacy Android style)
    $MAGICK -size "1024x1024" "xc:${BG_COLOR}" \
        \( "$LOGO_WHITE" -resize "614x614" \) \
        -gravity center -compose over -composite \
        "$IOS_ICON"
    echo -e "  ${GREEN}✓${NC} $IOS_ICON"
else
    echo -e "  ${YELLOW}Skipped: $IOS_ICON_DIR not found${NC}"
fi

# Cleanup temp files
rm -rf "$TMPDIR"

echo -e "\n${GREEN}App icons generated successfully!${NC}"
echo -e "Icon: white Ditto logo on ${GREEN}${BG_COLOR}${NC} (Ditto purple)"
echo -e "Generated:"
echo -e "  Android:"
echo -e "    - ic_launcher_foreground.png (adaptive, all densities)"
echo -e "    - ic_launcher.png (legacy square, all densities)"
echo -e "    - ic_launcher_round.png (legacy round, all densities)"
echo -e "  iOS:"
echo -e "    - AppIcon-512@2x.png (1024x1024)"
