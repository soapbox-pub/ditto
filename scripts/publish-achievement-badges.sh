#!/usr/bin/env bash
#
# Publish all Ditto achievement badge definitions (kind 30009) to relays.
#
# Usage:
#   ./scripts/publish-achievement-badges.sh
#
# You will be prompted for the nsec. It is not saved anywhere.
#
# The badge account is: npub1tn2ylw8sc42ew6rfzv4hwt47r4jza6jqadj7s2fmhf2q8xg7rscqqzmjlg
#
# Each badge is published as a kind 30009 addressable event with:
#   - ["t", "achievement"]  -- marks it as an achievement badge
#   - ["t", "<category>"]   -- the achievement category (social, profile, content, etc.)
#   - ["tier", "<tier>"]    -- optional tier (bronze, silver, gold, diamond)
#   - ["image", "<url>"]    -- blossom-hosted badge image
#   - ["name", "<name>"]    -- display name
#   - ["description", "<desc>"] -- how to earn it

set -euo pipefail

echo "Enter the nsec or hex secret key for the Ditto Badge account:"
echo "(npub1tn2ylw8sc42ew6rfzv4hwt47r4jza6jqadj7s2fmhf2q8xg7rscqqzmjlg)"
read -rs NOSTR_SECRET_KEY
export NOSTR_SECRET_KEY
echo ""

if [ -z "$NOSTR_SECRET_KEY" ]; then
  echo "Error: no key entered."
  exit 1
fi

RELAYS="wss://relay.ditto.pub"

publish() {
  local dtag="$1" name="$2" desc="$3" image="$4" category="$5" tier="${6:-}"

  local tags="-t t=achievement -t t=${category}"
  if [ -n "$tier" ]; then
    tags="$tags -t tier=${tier}"
  fi

  echo "Publishing: ${name} (${dtag})..."
  nak event -k 30009 \
    -d "$dtag" \
    -t "name=${name}" \
    -t "description=${desc}" \
    -t "image=${image}" \
    $tags \
    -c '' \
    $RELAYS 2>&1 | tail -1

  sleep 0.3
}

echo "=== Publishing Ditto Achievement Badges ==="
echo ""

# ── Social Milestones ──────────────────────────────────────────────────────────

publish "first-post" \
  "First Post" \
  "You said something! Your first note on Nostr." \
  "https://blossom.ditto.pub/315b12badfb58756275de21fb22ad6c33839f4cf113d2e65f9192e5f6a727140.jpeg" \
  "social"

publish "chatterbox-bronze" \
  "Chatterbox (Bronze)" \
  "10 notes and counting." \
  "https://blossom.ditto.pub/44afae385a0af2b213080fede4c353cd3095cd8eb41950175ea28d57d8e6b27c.jpeg" \
  "social" "bronze"

publish "chatterbox-silver" \
  "Chatterbox (Silver)" \
  "50 notes. You've got things to say." \
  "https://blossom.ditto.pub/43f0f9cced5510edb2b15b0c7e4025b1a0575c127f1ec81d0055c3a31a39553f.jpeg" \
  "social" "silver"

publish "chatterbox-gold" \
  "Chatterbox (Gold)" \
  "100 notes! A true voice of Nostr." \
  "https://blossom.primal.net/f755f4e2d69499c3ffa98fdca86537e0a558b2941605a668b9314c684aab4908.jpg" \
  "social" "gold"

publish "chatterbox-diamond" \
  "Chatterbox (Diamond)" \
  "1,000 notes. Legendary poster." \
  "https://blossom.primal.net/ab32b6bc5d81c436ad170c255b68c5d49a260553f0908961d0b75788f058bdd3.jpg" \
  "social" "diamond"

publish "thread-starter" \
  "Thread Starter" \
  "You wove your first thread." \
  "https://blossom.primal.net/0597febf9591f0c0d0e99ce487ce8bccbd45e65695b003b6d9623c1d129697e3.jpg" \
  "social"

publish "first-reaction" \
  "First Reaction" \
  "You liked something!" \
  "https://blossom.primal.net/fcaf13b6f90466a29a8f454878177eaf4996a3961e3171b071d0cc121738302d.jpg" \
  "social"

publish "first-repost" \
  "First Repost" \
  "Sharing is caring." \
  "https://blossom.primal.net/2823a360a1d0ab3c584306180442dfbfbbcc8da53010ec228bd769de19e4cb1d.jpg" \
  "social"

# ── Profile Completeness ───────────────────────────────────────────────────────

publish "identity-claimed" \
  "Identity Claimed" \
  "You have a name!" \
  "https://blossom.ditto.pub/a3a40933ee48d534511cc50bf0577cd130259983ea3fb2ee6c8f9943395ff6b1.jpeg" \
  "profile"

publish "face-reveal" \
  "Face Reveal" \
  "The world can see you now." \
  "https://blossom.ditto.pub/9a82c1da38014bda8753416db70ddfd3c41e4acbc55a95d33bdbb214fa480398.jpeg" \
  "profile"

publish "nip05-verified" \
  "Verified" \
  "Your identity is verified on the web." \
  "https://blossom.ditto.pub/01a4edfc7759312672bea9f2457e8c8e87b63c387950e3f30d6f051c9f196d10.jpeg" \
  "profile"

publish "lightning-ready" \
  "Lightning Ready" \
  "Ready to receive sats." \
  "https://blossom.primal.net/fa0f409a23ff36a25fcb29ddce4c3d374c75ab1f73d7de64012dd9e6e25f290d.jpg" \
  "profile"

publish "full-profile" \
  "Full Profile" \
  "Profile 100% complete. Looking sharp." \
  "https://blossom.ditto.pub/61f1e5d81047c4318c0d6f709cd2ccdbdaed52fb0182c6107d757d4f8e5d0349.jpeg" \
  "profile"

# ── Content Creator ────────────────────────────────────────────────────────────

publish "wordsmith" \
  "Wordsmith" \
  "Your first article. The pen is mightier." \
  "https://blossom.ditto.pub/a552c31890d153b9ecdfb52d709526816f86c2004f69bdc179f114753fd6ca85.jpeg" \
  "content"

publish "shutterbug" \
  "Shutterbug" \
  "Say cheese!" \
  "https://blossom.ditto.pub/5813ff6e33983d0b545c46eff58e74845f77dd07188e0ef1f1fa7680ac250527.jpeg" \
  "content"

publish "director" \
  "Director" \
  "Lights, camera, action!" \
  "https://blossom.ditto.pub/65ee3f500f5c565d838d7f5da306bde47d43316f20e542b04045f255edc3db75.jpeg" \
  "content"

publish "broadcaster" \
  "Broadcaster" \
  "Going live!" \
  "https://blossom.ditto.pub/555429ca9d171e1b99cdac0fb3657b2f2a0ad3bfaaa6f6f9122f9341cd463eda.jpeg" \
  "content"

publish "pollster" \
  "Pollster" \
  "Democracy in action." \
  "https://blossom.primal.net/2dd3f15fab2aad89552ff08ac46688db41930aedf1a02ea6b87d0043746ce9a7.jpg" \
  "content"

# ── Lightning & Economy ────────────────────────────────────────────────────────

publish "first-zap-sent" \
  "First Zap Sent" \
  "Your first lightning bolt!" \
  "https://blossom.ditto.pub/774a6486e6a75414972c8871ff25594a31cc734fd95cd5de2854e2ece7895622.jpeg" \
  "lightning"

publish "first-zap-received" \
  "First Zap Received" \
  "Sats incoming!" \
  "https://blossom.ditto.pub/65e5b25a81346307fa057f9be9cb54556ae9d04e092fa97eae84e0d9dea74128.jpeg" \
  "lightning"

publish "big-spender" \
  "Big Spender" \
  "Whale alert! 10k+ sat single zap." \
  "https://blossom.primal.net/f725396e1adac88e8afce6ecce4483f634e0e1c31d8df998d9b1f632259fecae.jpg" \
  "lightning"

publish "first-shop-purchase" \
  "Shopper" \
  "First purchase from the Badge Shop!" \
  "https://blossom.primal.net/758f220d0ea4bd36abfe68193cf7049ff4457ff89c0b5d46238143bb69df2a6f.jpg" \
  "lightning"

# ── Treasures & Exploration ────────────────────────────────────────────────────

publish "treasure-hunter" \
  "Treasure Hunter" \
  "X marks the spot!" \
  "https://blossom.ditto.pub/f3f7fa9353d6680f4c49af659b392e0c86e8348aed9a787b9bc0d70e39d0e5d4.jpeg" \
  "treasures"

publish "explorer-bronze" \
  "Explorer (Bronze)" \
  "The adventure begins. 5 treasures found." \
  "https://blossom.ditto.pub/746703cefd17257f1a03c2d37204caf8bc719d00c09f109acdd97c758efac424.jpeg" \
  "treasures" "bronze"

publish "explorer-gold" \
  "Explorer (Gold)" \
  "Legend of the trail. 100 treasures found." \
  "https://blossom.ditto.pub/6c977d0666892e66162a3dfef5e79a7c5db087fa4be55028ab8489f385b80604.jpeg" \
  "treasures" "gold"

publish "treasure-hider" \
  "Treasure Hider" \
  "You've hidden something for the world to find." \
  "https://blossom.primal.net/1733922c8688c6ed55dc1bec83686f1891139152a12e0507bbb04b54d0449ddc.jpg" \
  "treasures"

# ── Ditto Specials ─────────────────────────────────────────────────────────────

publish "welcome-to-ditto" \
  "Welcome to Ditto" \
  "You've arrived. Welcome home." \
  "https://blossom.ditto.pub/86ccfe9addf350ccabbefbe73409c9379ded4e43391a540d976ffaa0637d764a.jpeg" \
  "ditto-specials"

publish "vibe-check" \
  "Vibe Check" \
  "You set the vibe." \
  "https://blossom.ditto.pub/e63465975f0b4cc263f33a1bb9365f6f8ae2bad0b499e9f550387a3a2011aaa4.jpeg" \
  "ditto-specials"

publish "badge-collector-bronze" \
  "Badge Collector (Bronze)" \
  "Starting your collection. 5 badges accepted." \
  "https://blossom.primal.net/c5969407bb6e040c56393a1685ce0b21f3c330932db0a6a907201fa473359ca8.jpg" \
  "ditto-specials" "bronze"

publish "badge-creator" \
  "Badge Creator" \
  "Now you're a badge maker!" \
  "https://blossom.primal.net/49691324506c18f0a5b67ed0cb195a6af02e2a26cee3417256a05e9f2975a26c.jpg" \
  "ditto-specials"

publish "ai-conversationalist" \
  "AI Conversationalist" \
  "Chatting with the machines." \
  "https://blossom.primal.net/7422a13254c122287f6d66da344e27b9d86cb8309c69c54581f6bee154521997.jpg" \
  "ditto-specials"

echo ""
echo "=== Done! Published 31 achievement badge definitions ==="
