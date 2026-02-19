#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔐 Android Keystore Generator${NC}\n"

# Check if keytool is available
if ! command -v keytool &> /dev/null; then
    echo -e "${RED}❌ keytool not found!${NC}"
    echo -e "${YELLOW}Please install Java JDK to get keytool${NC}"
    exit 1
fi

# Check if keystore already exists
if [ -f "android/app/my-upload-key.keystore" ]; then
    echo -e "${YELLOW}⚠️  Keystore already exists!${NC}"
    echo -e "Location: android/app/my-upload-key.keystore"
    echo ""
    read -p "Do you want to overwrite it? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}Cancelled. Existing keystore preserved.${NC}"
        exit 0
    fi
    echo -e "${YELLOW}Backing up existing keystore...${NC}"
    cp android/app/my-upload-key.keystore android/app/my-upload-key.keystore.backup
fi

echo -e "${BLUE}Creating new Android signing keystore...${NC}\n"
echo -e "${YELLOW}You will be prompted for:${NC}"
echo "  • Keystore password (remember this!)"
echo "  • Key password (remember this!)"
echo "  • Your name and organization details"
echo ""

# Generate keystore
keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore android/app/my-upload-key.keystore \
  -alias upload \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000

echo -e "\n${GREEN}✅ Keystore created successfully!${NC}"
echo -e "Location: ${GREEN}android/app/my-upload-key.keystore${NC}"

# Prompt for key.properties creation
echo -e "\n${BLUE}Creating key.properties file...${NC}"
echo -e "${YELLOW}Enter the passwords you just used:${NC}\n"

read -sp "Keystore password: " STORE_PASSWORD
echo
read -sp "Key password: " KEY_PASSWORD
echo

# Create key.properties
cat > android/key.properties << EOF
storePassword=${STORE_PASSWORD}
keyPassword=${KEY_PASSWORD}
keyAlias=upload
storeFile=my-upload-key.keystore
EOF

echo -e "\n${GREEN}✅ key.properties created!${NC}"
echo -e "Location: ${GREEN}android/key.properties${NC}"

echo -e "\n${RED}🔒 IMPORTANT SECURITY NOTES:${NC}"
echo -e "  1. ${YELLOW}NEVER commit these files to git:${NC}"
echo -e "     • android/app/my-upload-key.keystore"
echo -e "     • android/key.properties"
echo -e "  2. ${YELLOW}Backup your keystore securely!${NC}"
echo -e "     If lost, you cannot update your app in stores"
echo -e "  3. ${YELLOW}Keep passwords safe${NC}"
echo -e "     Store in password manager or secure notes"

echo -e "\n${BLUE}Backup recommendations:${NC}"
echo -e "  • Copy keystore to encrypted USB drive"
echo -e "  • Store in password manager (1Password, Bitwarden, etc.)"
echo -e "  • Keep offline backup in safe place"

echo -e "\n${GREEN}✅ Setup complete!${NC}"
echo -e "You can now build signed APKs with: ${GREEN}npm run build:apk${NC}"
echo ""
