---
name: mac-runner
description: Operate the self-hosted GitLab Runner on the Mac that builds Ditto's iOS IPA. Covers SSH access, restarting the runner, viewing logs, updating Xcode, debugging fastlane locally, and rotating match certificates.
---

# Mac Runner Operations

Ditto's iOS pipeline runs two CI jobs on a self-hosted GitLab Runner on a MacBook in the rack: `build-ipa` (signs and builds the IPA via Xcode + fastlane match) and `publish-app-store` (uploads the IPA via `fastlane deliver`, which shells out to Apple's iTMSTransporter — that tool only ships inside Xcode, so this job can't run on Linux). This skill covers operating the Mac.

This skill covers operating the runner: SSH access, restarting after crashes or Xcode updates, watching logs, debugging fastlane locally, and rotating the match certificates. For initial provisioning, App Store Connect API key creation, and GitLab CI variable setup, load the **`ci-cd-publishing`** skill.

## Quick reference

| Need | Command |
|---|---|
| SSH in | `ssh alex@alexs-air.lan` |
| Runner status | `gitlab-runner status` |
| Restart runner | `gitlab-runner restart` (after `eval "$(/opt/homebrew/bin/brew shellenv)"`) |
| Stdout log | `tail -f ~/gitlab-runner.out.log` |
| Stderr log | `tail -f ~/gitlab-runner.err.log` |
| Runner config | `~/.gitlab-runner/config.toml` |
| LaunchAgent plist | `~/Library/LaunchAgents/gitlab-runner.plist` |

## Architecture

- **Host**: `alexs-air.lan` (Apple Silicon MacBook, macOS 26+, Xcode 26+)
- **User**: `alex` (the runner runs in user-mode so it can access keychain and Xcode UI tooling)
- **Tooling**: Homebrew (`/opt/homebrew`), `gitlab-runner`, `node@22`, `ruby@3.3`, fastlane installed as a user gem under `~/.gem/ruby/3.3.0/`
- **Service**: launchd LaunchAgent at `~/Library/LaunchAgents/gitlab-runner.plist`. `KeepAlive=true` (auto-restart on crash) and `RunAtLoad=true` (starts on login). The agent loads when `alex` logs in via auto-login at boot.
- **Tags**: `macos`, `ios`, `xcode` — both `build-ipa` and `publish-app-store` in `.gitlab-ci.yml` target this runner. `publish-app-store` doesn't sign anything, but it still needs Xcode's bundled iTMSTransporter to push the IPA to App Store Connect.
- **Shell setup**: `~/.bash_profile` sources brew shellenv and prepends `~/.gem/ruby/3.3.0/bin` and `/opt/homebrew/opt/ruby@3.3/bin` to `PATH` so `bash --login` (the runner's executor) finds fastlane + ruby 3.3.

### Why Ruby 3.3, not the brewed 4.0

Brewed `fastlane` (current version) ships running on Ruby 4.0 from `brew install ruby`. Ruby 4.0's OpenSSL bindings hit fastlane bug [#20553](https://github.com/fastlane/fastlane/issues/20553) — `OpenSSL::PKey::EC.new(pem)` raises "invalid curve name" for `prime256v1` keys, which breaks every App Store Connect API key signing operation. Ruby 3.3.x doesn't have this bug. So we install fastlane via `gem install fastlane --user-install` on `ruby@3.3` instead of `brew install fastlane`.

### Why IPv6 is disabled on Wi-Fi

`networksetup -setv6off Wi-Fi` is set because Ruby's net/http on this machine attempted IPv6 to `rubygems.org` first and timed out (~30 s per request). Disabling IPv6 on the Wi-Fi interface forces IPv4 immediately. To re-enable: `sudo networksetup -setv6automatic Wi-Fi`.

## Verifying the runner is healthy

From any machine:

```bash
curl -s -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  "https://gitlab.com/api/v4/runners/53111580" \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['status'], d['online'])"
```

Expected: `online True`. If `offline` or `not_connected`, SSH in and check:

```bash
ssh alex@alexs-air.lan
gitlab-runner status
ps aux | grep gitlab-runner
tail -50 ~/gitlab-runner.err.log
```

## Restarting the runner

After a Mac reboot, the runner should start automatically via the LaunchAgent. To restart manually:

```bash
ssh alex@alexs-air.lan
eval "$(/opt/homebrew/bin/brew shellenv)"
gitlab-runner restart
```

If `gitlab-runner restart` reports "service not installed", reinstall:

```bash
gitlab-runner install
gitlab-runner start
```

This rewrites the LaunchAgent plist.

## Watching a CI job run live

```bash
ssh alex@alexs-air.lan 'tail -f ~/gitlab-runner.out.log'
```

The runner streams build output to stdout. The same output appears in the GitLab job UI.

## Updating Xcode

After a major Xcode update:

```bash
ssh alex@alexs-air.lan
sudo xcodebuild -license accept     # accept the new license non-interactively
xcode-select --install              # ensure command-line tools are present
xcodebuild -version                 # confirm version
```

Then trigger a no-op tag rebuild (e.g. cut a patch release) to verify the runner still works.

## Debugging fastlane locally

If `build-ipa` fails in CI, reproduce on the Mac. The env vars below mirror what CI sets up:

```bash
ssh alex@alexs-air.lan
cd ~/Projects/ditto
git pull origin main
eval "$(/opt/homebrew/bin/brew shellenv)"

# Match what CI provides
export CI_COMMIT_TAG=v2.x.y
export CI_PIPELINE_IID=99999
export MATCH_PASSWORD='<from GitLab CI variables>'
export MATCH_GIT_BASIC_AUTHORIZATION='<base64 of ci-readonly:gldt-...>'
export APP_STORE_CONNECT_API_KEY_ID=<key-id>
export APP_STORE_CONNECT_API_KEY_ISSUER_ID=<issuer-id>
export ASC_KEY_PATH=~/.private_keys/AuthKey_<key-id>.p8

# Build web assets and sync to Capacitor iOS project (CI does this in before_script)
npm ci
npx vite build -l error
cp dist/index.html dist/404.html
npx cap sync ios
node scripts/patch-cap-config.mjs

# Stamp marketing version (CI does this in script)
VERSION="${CI_COMMIT_TAG#v}"
sed -i '' "s/MARKETING_VERSION = [0-9.]*;/MARKETING_VERSION = ${VERSION};/g" ios/App/App.xcodeproj/project.pbxproj

# Run the build lane
cd ios
fastlane build_ipa
```

This produces the IPA at `../artifacts/Ditto.ipa` exactly like CI. Add `--verbose` for detailed output.

To also test the submission step end-to-end (this calls Apple, so be ready to "Remove from Review" in App Store Connect afterward):

```bash
export IPA_PATH="$HOME/Projects/ditto/artifacts/Ditto.ipa"
fastlane submit_release
```

Or, to debug *just* the submission against an already-uploaded build without rebuilding, use the `submit_only` lane (see "Debugging App Store submission with the `submit_only` lane" below).

## Rotating match certificates (yearly)

Apple distribution certs expire one year after issuance. To renew:

```bash
ssh alex@alexs-air.lan
cd ~/Projects/ditto/ios
eval "$(/opt/homebrew/bin/brew shellenv)"

# Set Apple credentials (API key path)
export MATCH_PASSWORD='<from GitLab CI variables>'

# Revoke the expiring cert in Apple's portal and remove from the match repo
fastlane match nuke distribution

# Issue a new cert, generate a new App Store profile, encrypt, commit, push
fastlane match appstore \
  --api_key_path ~/.private_keys/AuthKey_<KEY_ID>.p8 \
  --api_key_id <KEY_ID> \
  --api_issuer_id <ISSUER_ID>
```

CI's next tag run picks up the new files via `match(... readonly: true)`. No GitLab variables to update.

## Debugging App Store submission with the `submit_only` lane

The `Fastfile` exposes a second lane, `submit_only`, that skips build/archive/upload and just runs `deliver` against an already-uploaded build. Useful when the binary is fine but the metadata/submission step is failing — iterate in ~30 seconds instead of waiting for a full ~6-minute CI build.

```bash
ssh alex@alexs-air.lan
export PATH="$HOME/.gem/ruby/3.3.0/bin:/opt/homebrew/opt/ruby@3.3/bin:$PATH"
cd ~/Projects/ditto/ios

# Make sure the .p8 is on disk; CI's after_script wipes it after each job
scp $LAPTOP:/path/to/AuthKey_<KEY_ID>.p8 ~/.private_keys/

export ASC_KEY_PATH=$HOME/.private_keys/AuthKey_<KEY_ID>.p8
export APP_STORE_CONNECT_API_KEY_ID=<KEY_ID>
export APP_STORE_CONNECT_API_KEY_ISSUER_ID=<ISSUER_ID>
export BUILD_NUMBER=<existing-build-number-on-ASC>
export VERSION=<marketing-version, e.g. 2.14.3>

fastlane submit_only
```

The lane expects the version to exist in App Store Connect with a `VALID` build attached. It uploads metadata (`./fastlane/metadata/en-US/release_notes.txt`) and calls `submit_for_review`. If Apple rejects, fix the Fastfile, re-run — no rebuild needed.

If Apple has already accepted the submission for that version, you'll need to "Remove from Review" in App Store Connect (only available while state is `WAITING_FOR_REVIEW`, not `IN_REVIEW`) before re-running, or bump the build number.

## Inspecting App Store Connect state directly

When fastlane's error messages aren't enough, query Apple's API directly. There's no installed CLI — use the JWT signing recipe Apple documents. A working Ruby snippet lives in this skill's troubleshooting history; the short version:

```ruby
require "json"; require "openssl"; require "net/http"; require "base64"
key_pem = File.read(ENV["ASC_KEY_PATH"])
ec = OpenSSL::PKey::EC.new(key_pem)
header = { alg: "ES256", kid: ENV["APP_STORE_CONNECT_API_KEY_ID"], typ: "JWT" }
payload = { iss: ENV["APP_STORE_CONNECT_API_KEY_ISSUER_ID"], iat: Time.now.to_i, exp: Time.now.to_i + 1200, aud: "appstoreconnect-v1" }
def b64(s); Base64.urlsafe_encode64(s, padding: false); end
si = b64(JSON.generate(header)) + "." + b64(JSON.generate(payload))
sig_der = ec.sign(OpenSSL::Digest::SHA256.new, si)
asn = OpenSSL::ASN1.decode(sig_der)
r = asn.value[0].value.to_s(2); s = asn.value[1].value.to_s(2)
r = ("\x00".b * (32 - r.bytesize)) + r if r.bytesize < 32
s = ("\x00".b * (32 - s.bytesize)) + s if s.bytesize < 32
jwt = si + "." + b64(r + s)
# Now: GET https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]=pub.ditto.app
# with header Authorization: Bearer <jwt>
```

Useful endpoints:
- `GET /v1/apps?filter[bundleId]=pub.ditto.app` → app id
- `GET /v1/apps/<id>/appStoreVersions` → version list with `appStoreState`
- `GET /v1/apps/<id>/builds?sort=-uploadedDate` → recent builds and processing state
- `GET /v1/appStoreVersions/<id>/appStoreVersionLocalizations` → release notes (`whatsNew`)

## What can go wrong

| Symptom | Likely cause | Fix |
|---|---|---|
| Runner shows offline in GitLab | Mac rebooted, auto-login disabled, or LaunchAgent unloaded | SSH in, `gitlab-runner status`, `gitlab-runner restart` |
| Build fails: "unable to find Xcode" | Xcode auto-updated and changed path, or command-line tools missing | `xcode-select --install`, `sudo xcodebuild -license accept` |
| Build fails: "no signing certificate found" | match cert expired, was revoked manually, or `MATCH_PASSWORD` mismatched | Run yearly rotation procedure above |
| Build fails: keychain locked / "User interaction is not allowed" | `setup_ci` failed to create the temporary keychain | Verify `FASTLANE_KEYCHAIN_PASSWORD` is set in GitLab CI variables |
| Build fails: ASC API key invalid | Key was revoked or rotated | Generate a new key and update `APP_STORE_CONNECT_API_KEY_*` variables |
| "Build already exists" from `deliver` | Previous tag's IPA had the same `CFBundleVersion`; fastlane's `increment_build_number` didn't bump because the value already matched `CI_PIPELINE_IID` | Push a new tag (each new tag has a new pipeline ID) |
| Apple precheck rejects metadata | Encryption export compliance, IDFA, content rights flags don't match `Fastfile` | Update `submission_information` in `ios/fastlane/Fastfile` |
| `OpenSSL::PKey::PKeyError: invalid curve name` | fastlane is running on brewed Ruby 4.0, which has a broken OpenSSL EC parser ([fastlane#20553](https://github.com/fastlane/fastlane/issues/20553)) | Use `ruby@3.3` from brew and install fastlane as a user gem (`gem install fastlane --user-install`); ensure `~/.bash_profile` puts `~/.gem/ruby/3.3.0/bin` on PATH ahead of `/opt/homebrew/bin` |
| `gem install` / `bundle install` hangs for >30s per request | Ruby's net/http tries IPv6 to rubygems.org and times out on this network | `sudo networksetup -setv6off Wi-Fi` (per-interface, persistent until reboot) |
| `Unresolved conflict between options: 'api_key_path' and 'api_key'` | `app_store_connect_api_key` action sets `APP_STORE_CONNECT_API_KEY_PATH` env var (path to `.p8`), match's same-named env var expects a JSON descriptor | Build the API key hash inline in the Fastfile (don't call `app_store_connect_api_key`); read `.p8` from a non-conflicting var like `ASC_KEY_PATH` |
| `[match] Could not find the newly generated certificate installed` when running match interactively on macOS 26+ | [fastlane#15185](https://github.com/fastlane/fastlane/issues/15185) — the new-cert verification step trips on partition list and keychain trust | Run cert generation **in CI** via the bootstrap procedure in the `ci-cd-publishing` skill (uses `setup_ci`'s ephemeral keychain). Don't run `fastlane match appstore` interactively. |
| iOS build fails: `No "iOS Development" signing certificate matching team ID` | The Xcode project uses `CODE_SIGN_STYLE=Automatic`; xcodebuild tries to find a Development cert even for Release builds | Override via `xcargs: "CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY='Apple Distribution' PROVISIONING_PROFILE_SPECIFIER='match AppStore <bundle-id>' DEVELOPMENT_TEAM=<team>"` in the Fastfile (already configured) |
| `vite.config.ts: Unexpected token 'c', "concurrent"... is not valid JSON` | GitLab Runner sets `CONFIG_FILE=/Users/alex/.gitlab-runner/config.toml` in the job environment, which collides with vite's `process.env.CONFIG_FILE ?? "./ditto.json"` lookup | Already fixed: use `DITTO_CONFIG_FILE` for the override env var |
| `whatsNew is missing` from `submit_for_review` | `metadata_path: "./metadata"` resolves relative to fastlane's cwd (`ios/`), not its config dir (`ios/fastlane/`); fastlane silently uploads zero locales | Use `metadata_path: "./fastlane/metadata"` (already configured) |
| `appStoreVersions ... is not in valid state` | Apple won't accept submission because the version is past `PREPARE_FOR_SUBMISSION` (already submitted, in review, or shipped) | "Remove from Review" in App Store Connect if `WAITING_FOR_REVIEW`, or cut a new version |
| `An attribute value is not acceptable for the current resource state. - contentRightsDeclaration` | Apple rejects PATCH on locked App-level fields when `submission_information` includes `content_rights_*` | Drop `content_rights_*` from `submission_information` in the Fastfile (already configured) |

## When the Mac dies

1. Get a replacement Mac. Install Xcode from the App Store.
2. Run the **`ci-cd-publishing`** skill's "Initial setup" — but skip the App Store Connect API key step (you already have it). Re-register the runner with the same `macos` tag.
3. Restore signing identity: `cd ditto/ios && fastlane match appstore --readonly` decrypts the existing certs/profiles using `MATCH_PASSWORD`.
4. No reissuance, no revocation, no GitLab variable updates needed. The certificates repo is the source of truth.
