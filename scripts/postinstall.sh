#!/bin/bash

# Copy default message sounds from @samthomson/nostr-messaging package
if [ -d "node_modules/@samthomson/nostr-messaging/assets/sounds" ]; then
  mkdir -p public/sounds
  cp node_modules/@samthomson/nostr-messaging/assets/sounds/*.mp3 public/sounds/
  echo "Copied message sounds to public/sounds/"
fi
