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
| `build`   | tags only                 | `build-apk` (signed release APK + AAB)  |
| `release` | tags only                 | GitLab Release with APK artifact        |
| `publish` | tags only                 | `publish-zapstore` + `publish-google-play` |

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
