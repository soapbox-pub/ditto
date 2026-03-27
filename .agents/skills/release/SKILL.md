---
name: release
description: Publish a new app release with versioning, changelog, native build files, and git tagging. Triggered by "publish a new release" or similar requests.
---

# Release Skill

This skill guides you through publishing a new release of the app. It handles version bumping, changelog generation, native build file updates, and git tagging/pushing.

## Overview

- **Version format**: Semantic versioning (X.Y.Z), starting from 2.0.0
- **Version source of truth**: `package.json` `version` field
- **Changelog**: `CHANGELOG.md` in repo root, using [Keep a Changelog](https://keepachangelog.com/) format
- **Version bumping**: Marketing-driven (not strict semver)
  - **Patch (Z)**: Bug fixes, minor tweaks, dependency updates, small UI adjustments
  - **Minor (Y)**: New user-facing features, significant UI changes, new pages/screens
  - **Major (X)**: Only when the user explicitly requests it (milestones, rebrands, major redesigns)
- **CI trigger**: Pushing a semver tag (`v2.1.0`) triggers the CI pipeline to build APKs, create a GitLab release, and publish to Zapstore

## Release Procedure

Follow these steps in order. Do NOT skip any step.

### Step 1: Required Reading

Before writing any release notes, you MUST read these pages to understand the product context, voice, and values:

1. **https://soapbox.pub/** -- Soapbox company overview and product suite
2. **https://soapbox.pub/ditto** -- Ditto product page with feature descriptions and positioning
3. **https://about.ditto.pub/** -- Ditto documentation landing page
4. **https://about.ditto.pub/philosophy** -- Ditto's design philosophy, core symbolism, and manifesto

These pages define what Ditto is, how it's positioned, and the tone of voice to use. Changelog entries should reflect this identity: fun, rebellious, user-focused, emphasizing freedom and self-expression. Avoid dry technical jargon -- write for people who use the app, not developers.

### Step 2: Pre-flight Checks

```bash
# Ensure working directory is clean
git status

# Ensure we're on main branch
git branch --show-current

# Run the full test suite
npm run test
```

- If the working directory has uncommitted changes, ask the user whether to commit them first or abort.
- If not on `main`, warn the user and ask whether to proceed.
- If tests fail, stop and fix the issues before continuing.

### Step 3: Determine What Changed

```bash
# Get the current version from package.json
node -p "require('./package.json').version"

# Get commits since the last version tag
git log v$(node -p "require('./package.json').version")..HEAD --oneline
```

- If there are no commits since the last tag, inform the user there is nothing to release and stop.
- Review the commit list to understand the scope of changes.

### Step 4: Decide the Version Bump

Analyze the commits from Step 3 and determine the appropriate bump level:

| Bump | When to use | Example |
|------|-------------|---------|
| **Patch** | Bug fixes, minor tweaks, dependency updates, small UI polish | 2.0.0 -> 2.0.1 |
| **Minor** | New user-facing features, new screens/pages, significant UI changes | 2.0.1 -> 2.1.0 |
| **Major** | ONLY when the user explicitly instructs a major bump | 2.1.0 -> 3.0.0 |

**Default to patch** when in doubt. Choose minor if there are clearly new features. Never auto-bump major.

When bumping minor, reset patch to 0 (e.g., 2.0.3 -> 2.1.0).
When bumping major, reset minor and patch to 0 (e.g., 2.3.1 -> 3.0.0).

### Step 5: Write the Changelog Entry

Prepend a new section to `CHANGELOG.md` directly below the `# Changelog` heading.

**Format:**

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- Description of new features

### Changed
- Description of changes to existing features

### Fixed
- Description of bug fixes

### Removed
- Description of removed features
```

**Rules:**
- Only include categories that have entries (omit empty categories)
- Write **user-facing descriptions**, not raw commit messages
- Keep descriptions concise -- one line per change
- Group related commits into single entries where appropriate
- Use present tense ("Add dark mode toggle", not "Added dark mode toggle")
- Focus on what the user sees/experiences, not internal implementation details
- Use the current date in YYYY-MM-DD format

### Step 6: Update Version in All Files

Update the version string in these files:

#### 6a. `package.json`

Update the `version` field:

```json
"version": "X.Y.Z"
```

#### 6b. `android/app/build.gradle`

Update `versionName` (line 17). Do NOT change `versionCode` -- that is managed by CI:

```groovy
versionName "X.Y.Z"
```

#### 6c. `ios/App/App.xcodeproj/project.pbxproj`

Update `MARKETING_VERSION` in all 4 occurrences (2 Debug configs + 2 Release configs):

```
MARKETING_VERSION = X.Y.Z;
```

**Important:** There are exactly 4 lines containing `MARKETING_VERSION` in this file. All 4 must be updated to the same value. Use a replaceAll operation.

Do NOT change `CURRENT_PROJECT_VERSION` -- it stays at `1` (may be managed separately for App Store submissions in the future).

### Step 7: Commit the Release

```bash
git add package.json CHANGELOG.md android/app/build.gradle ios/App/App.xcodeproj/project.pbxproj
git commit -m "release: vX.Y.Z"
```

### Step 8: Tag the Release

```bash
git tag vX.Y.Z
```

The tag format is `v` followed by the semver version with no suffix. Examples: `v2.0.0`, `v2.1.0`, `v2.1.1`.

### Step 9: Push

```bash
git push origin main --tags
```

This triggers the GitLab CI pipeline which will:
1. Build a signed Android APK and AAB
2. Create a GitLab Release with download links
3. Publish the APK to Zapstore

### Step 10: Confirm

After pushing, inform the user:
- The new version number
- A brief summary of what was released
- That CI will handle building and publishing the artifacts

## File Reference

| File | What to update | Notes |
|------|---------------|-------|
| `package.json` | `version` field | Source of truth for the version |
| `CHANGELOG.md` | Prepend new section | User-facing changelog |
| `android/app/build.gradle` | `versionName` on line 17 | `versionCode` is managed by CI |
| `ios/App/App.xcodeproj/project.pbxproj` | `MARKETING_VERSION` (4 occurrences) | `CURRENT_PROJECT_VERSION` stays at 1 |

## CI Pipeline

The CI pipeline (`.gitlab-ci.yml`) is triggered by tags matching the pattern `/^v\d+\.\d+\.\d+$/` (e.g., `v2.1.0`). It runs three jobs:

1. **build-apk**: Builds signed Android APK and AAB, stamps `versionName` and `versionCode` into the build
2. **release**: Creates a GitLab Release with the changelog content and download links
3. **publish-zapstore**: Publishes the APK to Zapstore

## Troubleshooting

### "Nothing to release"
If `git log` shows no commits since the last tag, there genuinely is nothing to release.

### Tests fail
Fix the failing tests before proceeding. The release must not contain broken code.

### Wrong version bumped
If you tagged the wrong version and haven't pushed yet:
```bash
git tag -d vX.Y.Z          # delete the local tag
git reset --soft HEAD~1     # undo the commit but keep changes staged
```
Then redo steps 4-9 with the correct version.

### Already pushed a bad release
This requires manual intervention. Inform the user and suggest they delete the tag and release from GitLab manually, then re-run the release process.
