#!/bin/bash

# Path to your debug keystore
DEBUG_KEYSTORE="$HOME/.android/debug.keystore"

# Password (default is 'android')
KEYSTORE_PASSWORD="android"

# Alias (default is 'androiddebugkey')
KEY_ALIAS="androiddebugkey"

# Check if keytool is available
if ! command -v keytool &> /dev/null; then
    echo "Error: keytool not found. Make sure you have Java installed and in your PATH."
    exit 1
fi

# Check if the debug keystore exists
if [ ! -f "$DEBUG_KEYSTORE" ]; then
    echo "Error: Debug keystore not found at $DEBUG_KEYSTORE"
    exit 1
fi

# Get the SHA-1 fingerprint
echo "Getting SHA-1 fingerprint for the debug keystore..."
keytool -list -v -keystore "$DEBUG_KEYSTORE" -alias "$KEY_ALIAS" -storepass "$KEYSTORE_PASSWORD" | grep "SHA1"

echo ""
echo "Add this SHA-1 fingerprint to your Firebase project at:"
echo "https://console.firebase.google.com/project/betai-f9176/settings/general/"
echo "Go to 'Your apps' > 'com.betai.android' > 'Add fingerprint'" 