#!/usr/bin/env bash
# Creates THE single Android release keystore (plan D1, R8). Run once, then reuse it for
# EAS (credentialsSource: local) and local release builds so assetlinks.json has one SHA-256.
#
#   ANDROID_KEYSTORE_PASSWORD=... ANDROID_KEY_ALIAS=zuirock ANDROID_KEY_PASSWORD=... \
#     scripts/make-keystore.sh
#
# Output (all git-ignored — never commit them):
#   apps/mobile/credentials/zuirock-release.jks
#   apps/mobile/credentials.json   (EAS local credentials; contains the passwords)
# Back the keystore and passwords up in a password manager; losing them breaks App Links.
# Record the printed SHA-256 in docs/demo-runbook.md and .well-known/assetlinks.json.
set -euo pipefail

: "${ANDROID_KEYSTORE_PASSWORD:?set ANDROID_KEYSTORE_PASSWORD}"
: "${ANDROID_KEY_PASSWORD:?set ANDROID_KEY_PASSWORD}"
ALIAS="${ANDROID_KEY_ALIAS:-zuirock}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/apps/mobile"
DIR="$MOBILE/credentials"
KEYSTORE="$DIR/zuirock-release.jks"

command -v keytool >/dev/null || { echo "keytool not found (install a JDK 17+)" >&2; exit 1; }

if [[ -e "$KEYSTORE" ]]; then
  echo "Refusing to overwrite $KEYSTORE — the keystore is fixed once created." >&2
  exit 1
fi

if ! git -C "$ROOT" check-ignore -q "$KEYSTORE" || ! git -C "$ROOT" check-ignore -q "$MOBILE/credentials.json"; then
  echo "Keystore paths are not git-ignored; fix .gitignore first." >&2
  exit 1
fi

mkdir -p "$DIR"
keytool -genkeypair -v \
  -keystore "$KEYSTORE" -storetype JKS \
  -alias "$ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$ANDROID_KEYSTORE_PASSWORD" -keypass "$ANDROID_KEY_PASSWORD" \
  -dname "CN=Zuirock, O=Zuirock, C=KR" >/dev/null

umask 077
cat >"$MOBILE/credentials.json" <<JSON
{
  "android": {
    "keystore": {
      "keystorePath": "credentials/zuirock-release.jks",
      "keystorePassword": "$ANDROID_KEYSTORE_PASSWORD",
      "keyAlias": "$ALIAS",
      "keyPassword": "$ANDROID_KEY_PASSWORD"
    }
  }
}
JSON

echo "Keystore: $KEYSTORE"
keytool -list -v -keystore "$KEYSTORE" -alias "$ALIAS" -storepass "$ANDROID_KEYSTORE_PASSWORD" |
  sed -n 's/^[[:space:]]*SHA256: /SHA-256 (assetlinks sha256_cert_fingerprints): /p'
