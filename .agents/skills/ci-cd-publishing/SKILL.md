---
name: ci-cd-publishing
description: Ditto's release and publishing pipeline — cutting a version tag, Zapstore APK publishing with NIP-46 bunker auth, nsite web deploys via nsyte, and Google Play AAB uploads via fastlane supply. Includes GitLab CI variable setup and credential rotation.
---

# CI/CD Pipeline and Publishing

Ditto uses GitLab CI (`.gitlab-ci.yml`) to run tests on every commit, deploy the web app to nsite on every default-branch push, and build + publish Android binaries to Zapstore and Google Play on every tag. Load this skill when setting up CI credentials, rotating a signing key, diagnosing a failed publish, or adding a new publishing target.

## Pipeline Overview

| Stage     | Runs on                   | Job                                     |
|-----------|---------------------------|-----------------------------------------|
| `test`    | every commit (not tags)   | `npm run test`                          |
| `deploy`  | default branch only       | `deploy-nsite` (Vite build → nsyte)     |
| `build`   | tags only                 | `build-apk` (signed APK + AAB) + `build-ipa` (signed IPA on the Mac runner) |
| `release` | tags only                 | GitLab Release with APK / AAB / IPA links |
| `publish` | tags only                 | `publish-zapstore` + `publish-google-play` + `publish-app-store` |

## Creating a Release

Releases are triggered by pushing a version tag:

```bash
npm run release
```

This creates a tag in the format `v2026.03.14+abc1234` (date + short commit hash) and pushes it to GitLab, which triggers the `build-apk`, `release`, `publish-zapstore`, and `publish-google-play` jobs.

For the full versioning / changelog / native-build workflow, load the **`release`** skill.

## Zapstore Publishing

The `publish-zapstore` CI job uploads signed APKs to [Zapstore](https://zapstore.dev/) using the [`zsp`](https://github.com/zapstore/zsp) CLI and NIP-46 bunker signing via Amber.

**Configuration files:**

- `zapstore.yaml` — app metadata for Zapstore (name, tags, icon, supported NIPs)
- `.gitlab-ci.yml` — the `publish-zapstore` job definition

**GitLab CI/CD variables** (Settings → CI/CD → Variables):

| Variable | Description | Protected | Masked | Raw |
|---|---|---|---|---|
| `ZAPSTORE_BUNKER_URL` | NIP-46 bunker URL (`bunker://<pubkey>?relay=...`). No `secret` param needed after initial auth. | Yes | No | Yes |
| `ZAPSTORE_CLIENT_KEY` | Hex private key used as the NIP-46 client identity for bunker communication | Yes | Yes | Yes |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded Android signing keystore | Yes | Yes | Yes |
| `KEYSTORE_PASSWORD` | Android keystore password | Yes | Yes | Yes |
| `KEY_PASSWORD` | Android key password | Yes | Yes | Yes |

### How NIP-46 bunker auth works in CI

NIP-46 bunker signing requires two keys: the **user's key** (held by Amber) and a **client key** (the CI runner's identity). The bunker authorizes specific client pubkeys — once authorized, the client can request signatures without re-approval.

The `publish-zapstore` job restores the client key from `ZAPSTORE_CLIENT_KEY` into `~/.config/zsp/bunker-keys/<bunker-pubkey>.key` before running `zsp`, so the bunker recognizes the CI runner as an already-authorized client.

### Initial setup (one-time)

Run the NIP-46 client-initiated auth script:

```bash
node scripts/nip46-auth.mjs
```

This generates a `nostrconnect://` URI. Import/paste it into Amber and approve the connection. The script outputs the `bunker://` URI and client key hex, and writes the client key to `~/.config/zsp/bunker-keys/`. Update the GitLab CI/CD variables with the printed values.

Options:
- `--relay <url>` — relay for NIP-46 communication (default: `wss://relay.ditto.pub`)
- `--name <name>` — app name shown to the signer (default: `Ditto`)
- `--timeout <sec>` — how long to wait for approval (default: 300)

After authorization, the bunker recognizes the client key and no secret or manual approval is needed for CI runs. If the client key is rotated, run the script again and update the GitLab variables.

## nsite Publishing

The `deploy-nsite` CI job deploys the Vite build to [nsite](https://nsite.run) on every push to the default branch using [nsyte](https://github.com/sandwichfarm/nsyte). The job uploads `dist/` to Blossom servers and publishes site manifest events to Nostr relays.

nsyte uses a NIP-46 bunker credential called **nbunksec** — a bech32-encoded string bundling the bunker pubkey, client secret key, and relay info into a single self-contained token. It's passed to nsyte via `--sec`.

**GitLab CI/CD variables:**

| Variable | Description | Protected | Masked | Raw |
|---|---|---|---|---|
| `NSITE_NBUNKSEC` | nbunksec credential from `nsyte ci`. Must start with `nbunksec1`. | Yes | Yes | Yes |

### Initial setup (one-time)

1. Install nsyte locally:
   ```bash
   curl -fsSL https://nsyte.run/get/install.sh | bash
   ```
2. Generate the CI credential:
   ```bash
   nsyte ci
   ```
   This guides you through connecting a NIP-46 bunker (e.g. Amber) and outputs an `nbunksec1...` string. The credential is shown only once.
3. Add the `nbunksec1...` value as `NSITE_NBUNKSEC` in GitLab CI/CD settings. Mark it as **Protected** and **Masked**.

### Configured relays and servers

Relays the deploy job publishes to:

- `wss://relay.ditto.pub`
- `wss://relay.nsite.lol`
- `wss://relay.dreamith.to`
- `wss://relay.primal.net`

Blossom servers:

- `https://blossom.primal.net`
- `https://blossom.ditto.pub`
- `https://blossom.dreamith.to`

The `--use-fallback-relays` and `--use-fallback-servers` flags include nsyte's built-in defaults for broader coverage. The `--fallback "/index.html"` flag enables SPA client-side routing.

### Credential rotation

To rotate the nsite credential:

1. Revoke the old bunker connection in your signer app.
2. Run `nsyte ci` again to generate a new `nbunksec1...` string.
3. Update the `NSITE_NBUNKSEC` variable in GitLab CI/CD settings.

## Google Play Publishing

The `publish-google-play` CI job uploads Android AABs to [Google Play](https://play.google.com/store/apps/details?id=pub.ditto.app) using [fastlane supply](https://docs.fastlane.tools/actions/supply/). It runs after a successful AAB build and uploads directly to the production track.

**GitLab CI/CD variables:**

| Variable | Description | Protected | Masked | Raw |
|---|---|---|---|---|
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | **Base64-encoded** contents of the Google Play API service account key JSON. The CI job decodes with `base64 -d` before passing to `fastlane supply`. | Yes | Yes | No |

### Initial setup (one-time)

1. Create or reuse a project in [Google Cloud Console](https://console.cloud.google.com/projectcreate).
2. Enable the [Google Play Developer API](https://console.developers.google.com/apis/api/androidpublisher.googleapis.com/) for that project.
3. In Google Cloud Console, go to [Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts), create a service account, and download a JSON key file for it.
4. In Google Play Console, go to [Users & Permissions](https://play.google.com/console/users-and-permissions), click **Invite new users**, enter the service account email, and grant it permission to manage releases for `pub.ditto.app`.
5. **Base64-encode** the key file:

   ```bash
   # Linux
   base64 -w0 service-account.json

   # macOS
   base64 -i service-account.json | tr -d '\n'
   ```

6. Add the base64-encoded value as `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` in GitLab CI/CD settings. Mark it as **Protected** and **Masked**. **Do not paste the raw JSON** — the CI script expects base64 and will fail to decode a raw value.

### Key points

- The job uploads the signed **AAB** (not APK) — Google Play requires App Bundles.
- Uploads go directly to the **production** track. Google's review process still applies before the update reaches users.
- Metadata, screenshots, and changelogs are managed in the Play Console, not via CI (the job uses `--skip_upload_metadata` etc.).
- The same signing keystore used for Zapstore is reused here (`ANDROID_KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_PASSWORD`).

## App Store Publishing

Ditto's iOS pipeline is split across two jobs:

- **`build-ipa`** (stage `build`, `tags: [macos]`) runs on the self-hosted Mac runner. Decodes the App Store Connect API key, fetches the encrypted distribution cert + provisioning profile via fastlane match, builds the web assets, runs `cap sync ios`, stamps the marketing version into `project.pbxproj`, then `fastlane build_ipa` produces a signed App Store IPA at `artifacts/Ditto.ipa`. The IPA is uploaded to the GitLab Generic Packages registry as `Ditto-${CI_COMMIT_TAG}.ipa` (mirrors how `build-apk` publishes the APK and AAB) and exposed as a CI artifact for downstream jobs.
- **`publish-app-store`** (stage `publish`, `image: ruby:3.3` on a shared Linux runner) consumes the IPA artifact via `needs: [build-ipa]`. Installs fastlane via `gem install`, decodes the API key, extracts the changelog section for the tag into `release_notes.txt`, and runs `fastlane submit_release` which calls `deliver` to upload metadata + select the prebuilt build + auto-submit for App Store review. No Xcode required, no signing in this job — it's just an Apple API call.

The Mac runner is therefore only used for `build-ipa`. For runner administration (operating the Mac, restarting the agent, viewing logs, rotating signing certs), load the **`mac-runner`** skill.

**Configuration files:**

- `ios/fastlane/Fastfile` — exposes four lanes:
  - `build_ipa` — setup_ci → match (readonly, with API key) → increment_build_number → build_app. Used by CI's `build-ipa`.
  - `submit_release` — reads `IPA_PATH` env var, calls deliver against the prebuilt IPA. Used by CI's `publish-app-store`.
  - `release` — combines build_ipa + submit_release; convenience for local one-shot runs.
  - `submit_only` — debug lane that skips build/upload and only runs deliver against an already-uploaded build (set `BUILD_NUMBER` + `VERSION` env vars). See the `mac-runner` skill.
- `ios/fastlane/Appfile` — bundle identifier and team ID
- `ios/fastlane/Matchfile` — points at the shared `soapbox-pub/certificates` repo
- `ios/fastlane/metadata/en-US/release_notes.txt` — placeholder; CI overwrites it from `CHANGELOG.md` per release
- `.gitlab-ci.yml` — `build-ipa` (Mac runner, `tags: [macos]`) + `publish-app-store` (Linux runner)

**Code signing storage**: a private GitLab repo `soapbox-pub/certificates` holds encrypted distribution certs and provisioning profiles, managed by [fastlane match](https://docs.fastlane.tools/actions/match/). Match handles cert/profile lifecycle: one passphrase decrypts everything; the same repo can hold signing material for multiple Soapbox iOS apps under team `GZLTTH5DLM`.

**App Store Connect auth**: a long-lived [App Store Connect API key](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api) (`.p8` file + key ID + issuer ID) authenticates `match`, `deliver`, and `pilot`. Avoids 2FA prompts that would interrupt CI.

**Distribution**: `submit_for_review: true` automatically pushes the build into Apple's review queue once uploaded. `automatic_release: false` keeps a human-controlled final gate — once Apple approves, you click "Release" in the App Store Connect web UI to publish to users. To remove the manual gate, flip `automatic_release` to `true` in `ios/fastlane/Fastfile`.

**Release notes**: extracted from `CHANGELOG.md` per tag using the same `awk` extraction as the GitLab `release` job, written to `ios/fastlane/metadata/en-US/release_notes.txt`, uploaded by `deliver` as the App Store "What's New in This Version" text.

**IPA distribution beyond the App Store**: `build-ipa` uploads the signed IPA to the GitLab Generic Packages registry, and the `release` job links it from the GitLab Release page. The IPA is signed with the App Store distribution profile, so it isn't directly sideloadable — installation goes through Apple's review process — but having it as a stable artifact lays the groundwork for AltStore or ad-hoc distribution later (which would require a separate provisioning profile).

**GitLab CI/CD variables:**

| Variable | Description | Protected | Masked | Raw |
|---|---|---|---|---|
| `MATCH_PASSWORD` | Symmetric passphrase used by match to encrypt/decrypt certs and profiles. The single most important secret — losing it makes the cert repo unreadable. | Yes | Yes | Yes |
| `MATCH_GIT_BASIC_AUTHORIZATION` | Base64 of `username:deploy-token` for HTTPS clone of the certificates repo. Generated from a `read_repository`-scoped deploy token on `soapbox-pub/certificates`. | Yes | Yes | Yes |
| `APP_STORE_CONNECT_API_KEY_ID` | App Store Connect API key ID (10 chars). | Yes | No | Yes |
| `APP_STORE_CONNECT_API_KEY_ISSUER_ID` | App Store Connect issuer ID (UUID). | Yes | No | Yes |
| `APP_STORE_CONNECT_API_KEY_P8_BASE64` | Base64-encoded contents of the `.p8` private key file. CI decodes with `base64 -d` into `~/.private_keys/AuthKey_<KEY_ID>.p8` and removes it in `after_script`. | Yes | Yes | Yes |
| `FASTLANE_KEYCHAIN_PASSWORD` | Password for the ephemeral keychain `setup_ci` creates per build. Random per setup; keep stable across runs. | Yes | Yes | Yes |

### Initial setup (one-time)

1. **Provision the Mac runner.** See the **`mac-runner`** skill for hardware/launchd setup, Xcode, Homebrew, fastlane, and `gitlab-runner` registration.

2. **Create the App Store Connect API key.** Log in to [App Store Connect](https://appstoreconnect.apple.com) → Users and Access → Integrations → App Store Connect API → Generate. Use the **App Manager** role (sufficient for `deliver`'s upload + submit-for-review). Download the `.p8` file (one-time download — Apple won't show it again). Note the **Key ID** (10-char string next to the key) and the **Issuer ID** (UUID at the top of the API page).

   Set the three GitLab CI variables:
   ```bash
   # Replace <ISSUER_ID>, <KEY_ID>, and the path to your .p8
   curl -X POST -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
     "https://gitlab.com/api/v4/projects/$PROJECT_ID/variables" \
     --data-urlencode "key=APP_STORE_CONNECT_API_KEY_ISSUER_ID" \
     --data-urlencode "value=<ISSUER_ID>" \
     --data-urlencode "protected=true" --data-urlencode "raw=true"
   # repeat for APP_STORE_CONNECT_API_KEY_ID
   # for the .p8, base64 first:
   base64 -i AuthKey_<KEY_ID>.p8 | tr -d '\n'  # paste this as APP_STORE_CONNECT_API_KEY_P8_BASE64 (masked)
   ```

3. **Create the certificates repo.** A private GitLab repo at `soapbox-pub/certificates` holds match-encrypted certs/profiles. Create a project deploy token on it (Settings → Repository → Deploy tokens) with `read_repository` scope. Encode `username:token` as base64 → set as `MATCH_GIT_BASIC_AUTHORIZATION` (protected, masked, raw).

4. **Generate `MATCH_PASSWORD` and `FASTLANE_KEYCHAIN_PASSWORD`.** Both are arbitrary strong random strings — `openssl rand -base64 32 | tr -d '=+/' | head -c 32` works. Store them as protected, masked GitLab variables.

5. **Bootstrap match certs via a one-shot CI job** (preferred over running match locally — avoids the macOS keychain UI permission dialogs that fastlane bug [#15185](https://github.com/fastlane/fastlane/issues/15185) trips on newer macOS):

   a. Create a temporary write-scoped GitLab variable. The deploy token is `read_repository`; for the initial cert creation match needs to push. Encode `username:write-pat` as base64 and set it as `MATCH_GIT_BASIC_AUTHORIZATION_WRITE` (Protected, Masked, Raw).

   b. Add a temporary `setup-match` job to `.gitlab-ci.yml` that runs on the macos runner with `setup_ci` (which creates an ephemeral keychain — bypasses the GUI permission issue):

      ```yaml
      setup-match:
        stage: publish
        tags: [macos]
        rules:
          - if: $SETUP_MATCH == "1"
            when: manual
        script:
          - export ASC_KEY_PATH="$HOME/.private_keys/AuthKey_${APP_STORE_CONNECT_API_KEY_ID}.p8"
          - mkdir -p "$HOME/.private_keys" && chmod 700 "$HOME/.private_keys"
          - echo "$APP_STORE_CONNECT_API_KEY_P8_BASE64" | base64 -d > "$ASC_KEY_PATH"
          - chmod 600 "$ASC_KEY_PATH"
          - cd ios
          - export MATCH_GIT_BASIC_AUTHORIZATION="$MATCH_GIT_BASIC_AUTHORIZATION_WRITE"
          - unset APP_STORE_CONNECT_API_KEY_PATH || true
          - |
            cat > Fastfile.setup <<'RUBY'
            default_platform(:ios)
            platform :ios do
              lane :setup do
                setup_ci
                api_key = {
                  key_id: ENV.fetch("APP_STORE_CONNECT_API_KEY_ID"),
                  issuer_id: ENV.fetch("APP_STORE_CONNECT_API_KEY_ISSUER_ID"),
                  key: File.binread(ENV.fetch("ASC_KEY_PATH")),
                  duration: 1200,
                  in_house: false,
                }
                match(type: "appstore", readonly: false, api_key: api_key, force_for_new_devices: true)
              end
            end
            RUBY
          - mv fastlane/Fastfile fastlane/Fastfile.bak
          - mv Fastfile.setup fastlane/Fastfile
          - fastlane setup
          - mv fastlane/Fastfile.bak fastlane/Fastfile
        after_script:
          - rm -f "$HOME/.private_keys"/AuthKey_*.p8 || true
      ```

   c. Trigger the pipeline manually with `SETUP_MATCH=1`:

      ```bash
      curl -X POST -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
        "https://gitlab.com/api/v4/projects/$PROJECT_ID/pipeline" \
        --data-urlencode "ref=main" \
        --data-urlencode "variables[][key]=SETUP_MATCH" \
        --data-urlencode "variables[][value]=1"
      # Then play the manual setup-match job
      ```

   d. Once the job succeeds (cert + profile pushed to the certificates repo), **delete the `setup-match` job from `.gitlab-ci.yml` and the `MATCH_GIT_BASIC_AUTHORIZATION_WRITE` variable**. They're only needed for bootstrap.

### Yearly cert renewal

Apple distribution certs expire annually. Renewal is one command per year, run on any Mac:

```bash
cd ~/Projects/ditto/ios
fastlane match nuke distribution      # revokes old cert in Apple's portal, removes from match repo
fastlane match appstore               # creates new cert + profile, encrypts, commits, pushes
```

CI's next tag run picks up the new files automatically (`match(... readonly: true)`).

### Disaster recovery (Mac dies / new developer joins)

```bash
git clone https://gitlab.com/soapbox-pub/ditto.git
cd ditto/ios
fastlane match appstore --readonly    # decrypts existing certs/profiles using MATCH_PASSWORD
```

No re-issuance of certs needed — the cert repo is the source of truth.

### App Store Connect API key rotation

App Store Connect API keys can be revoked anytime. To rotate:

1. App Store Connect → Users and Access → Integrations → App Store Connect API → Generate new key
2. Download the new `.p8`, note the new key ID
3. Update `APP_STORE_CONNECT_API_KEY_ID` and `APP_STORE_CONNECT_API_KEY_P8_BASE64` in GitLab variables
4. (Issuer ID stays the same — it's per-team, not per-key)
5. Revoke the old key in App Store Connect

### Key points

- `build-ipa` (Mac) produces a signed **IPA** (App Store distribution format) and uploads it to GitLab's Generic Packages registry. `publish-app-store` (Linux) submits it to Apple via `deliver`.
- Builds go to **App Store Connect**, automatically submit for review, but do **not** auto-release after approval. The final "Release" click is manual in the web UI.
- Marketing version comes from the git tag (`v2.1.0` → `MARKETING_VERSION = 2.1.0`); build number comes from `CI_PIPELINE_IID`.
- Release notes ("What's New in This Version") are auto-extracted from `CHANGELOG.md` and uploaded by `deliver`.
- `setup_ci` (in `build-ipa`) creates an ephemeral keychain per build, so the runner never touches the login keychain — works whether or not a GUI session is logged in.
- `publish-app-store` doesn't sign anything, so it doesn't need macOS or a keychain — pure Apple API call.
