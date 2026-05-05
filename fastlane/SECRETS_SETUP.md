# Release Pipeline — Secrets Setup

All secrets go in GitHub → Settings → Secrets and variables → Actions → New repository secret.

---

## iOS (TestFlight + App Store)

| Secret | How to get it |
|--------|---------------|
| `APP_STORE_CONNECT_API_KEY_KEY_ID` | App Store Connect → Users & Access → Integrations → App Store Connect API → Key ID |
| `APP_STORE_CONNECT_API_KEY_ISSUER_ID` | Same page — Issuer ID at the top |
| `APP_STORE_CONNECT_API_KEY_KEY` | Download the .p8 key, then: `base64 -i AuthKey_KEYID.p8 \| tr -d '\n'` |
| `MATCH_GIT_URL` | SSH URL of a **private** repo that will store encrypted certs, e.g. `git@github.com:phyzikaldaking/ems-certs.git` |
| `MATCH_PASSWORD` | A strong passphrase you choose — used to encrypt/decrypt the certs repo |
| `KEYCHAIN_PASSWORD` | Any strong password — used only to create a temporary keychain in CI |

### First-time iOS signing setup (run locally once)
```bash
bundle install
bundle exec fastlane match init        # point to your private certs repo
bundle exec fastlane match appstore    # generates + uploads Distribution cert + provisioning profile
```

---

## Android (Play Store)

| Secret | How to get it |
|--------|---------------|
| `ANDROID_KEYSTORE_BASE64` | `base64 -i release.keystore \| tr -d '\n'` |
| `ANDROID_KEYSTORE_PASSWORD` | Password you used when creating the keystore |
| `ANDROID_KEY_ALIAS` | Alias used when creating the keystore |
| `ANDROID_KEY_PASSWORD` | Key password (often same as keystore password) |
| `GOOGLE_PLAY_JSON_KEY_BASE64` | Google Play Console → Setup → API access → Service account JSON → `base64 -i key.json \| tr -d '\n'` |

### First-time Android keystore creation (run once, keep the .keystore file safe)
```bash
keytool -genkey -v \
  -keystore release.keystore \
  -alias epicmusicspace \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

---

## Triggering a release

### Beta (TestFlight + Play internal)
```bash
git tag v1.0.0-beta.1
git push origin v1.0.0-beta.1
```

### Production (App Store review + Play production)
```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow will:
1. Run `cap sync` to copy the latest web assets into the native project
2. Build signed iOS IPA / Android AAB
3. Upload to TestFlight / Play Store internal track
4. For production tags (no `-` suffix) → submit for App Store review + promote Play to production

---

## App Store metadata

Store your App Store listing text in `fastlane/metadata/ios/en-US/`:
- `name.txt` — app name
- `description.txt` — full description
- `keywords.txt` — keywords (comma-separated)
- `release_notes.txt` — what's new

These are uploaded with `fastlane deliver` during the production release lane.
