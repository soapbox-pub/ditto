#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Generating Android app icons...${NC}\n"

# Check for rsvg-convert (preferred for SVG) or inkscape as fallback
if command -v rsvg-convert &> /dev/null; then
    SVG_RENDERER="rsvg"
elif command -v inkscape &> /dev/null; then
    SVG_RENDERER="inkscape"
else
    echo -e "${YELLOW}Warning: neither rsvg-convert nor inkscape found. Install one to render SVG icons.${NC}"
    echo "On Fedora/RHEL: sudo dnf install librsvg2-tools"
    echo "On Ubuntu/Debian: sudo apt-get install librsvg2-bin"
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
FG_COLOR="#FFFFFF"   # White icon

# Render SVG to a high-res PNG with white fill, then composite onto purple background.
# The SVG uses the brand purple (#7c52e0) as fill — we recolor to white via ImageMagick.
TMPDIR=$(mktemp -d)
LOGO_HI_RES="$TMPDIR/logo_raw.png"
LOGO_WHITE="$TMPDIR/logo_white.png"
ICON_512="$TMPDIR/icon_512.png"

echo "Rendering SVG at 512x512..."

if [ "$SVG_RENDERER" = "rsvg" ]; then
    rsvg-convert -w 512 -h 512 "$SOURCE_SVG" -o "$LOGO_HI_RES"
else
    inkscape --export-type=png --export-filename="$LOGO_HI_RES" -w 512 -h 512 "$SOURCE_SVG"
fi

# Recolor: replace the purple fill with white, keep alpha
$MAGICK "$LOGO_HI_RES" \
    -alpha on \
    \( +clone -alpha extract \) \
    -compose CopyOpacity -composite \
    -fill white -colorize 100 \
    "$LOGO_WHITE"

# Composite white logo onto purple background (full bleed for non-adaptive legacy icons)
# Logo scaled to 80% with padding for aesthetic balance
$MAGICK -size 512x512 "xc:${BG_COLOR}" \
    \( "$LOGO_WHITE" -resize 410x410 \) \
    -gravity center -compose over -composite \
    "$ICON_512"

# Create Android resource directories if they don't exist
mkdir -p android/app/src/main/res/{mipmap-mdpi,mipmap-hdpi,mipmap-xhdpi,mipmap-xxhdpi,mipmap-xxxhdpi}

# ── Legacy / non-adaptive launcher icons (full bleed: purple bg + white logo) ──

echo "Generating mdpi icons (48x48)..."
$MAGICK "$ICON_512" -resize 48x48 android/app/src/main/res/mipmap-mdpi/ic_launcher.png
$MAGICK "$ICON_512" -resize 48x48 android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png

echo "Generating hdpi icons (72x72)..."
$MAGICK "$ICON_512" -resize 72x72 android/app/src/main/res/mipmap-hdpi/ic_launcher.png
$MAGICK "$ICON_512" -resize 72x72 android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png

echo "Generating xhdpi icons (96x96)..."
$MAGICK "$ICON_512" -resize 96x96 android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
$MAGICK "$ICON_512" -resize 96x96 android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png

echo "Generating xxhdpi icons (144x144)..."
$MAGICK "$ICON_512" -resize 144x144 android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
$MAGICK "$ICON_512" -resize 144x144 android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png

echo "Generating xxxhdpi icons (192x192)..."
$MAGICK "$ICON_512" -resize 192x192 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
$MAGICK "$ICON_512" -resize 192x192 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png

# ── Adaptive icon foreground PNGs (transparent bg, white logo with safe-zone padding) ──
# Foreground safe zone = 66% of canvas. Content should be ~66% size, centered on transparent bg.

echo "Generating adaptive foreground PNGs..."

make_foreground() {
    local size=$1
    local content_size=$(echo "$size * 66 / 100" | bc)
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
