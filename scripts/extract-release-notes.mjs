#!/usr/bin/env node
/**
 * Extract release notes from CHANGELOG.md for a given version.
 *
 * The CHANGELOG follows Keep a Changelog format with one extension: each release
 * section MAY begin with a single plaintext paragraph (the "summary") before any
 * `### Added` / `### Changed` / etc. heading. The summary is used as the release
 * blurb on the App Store, Play Store, and the in-app version-update toast. The
 * full section body is used as the GitLab Release description.
 *
 * Format:
 *
 *   ## [X.Y.Z] - YYYY-MM-DD
 *
 *   A short single-paragraph summary (max 500 characters by convention).
 *
 *   ### Added
 *   - bullet
 *   - bullet
 *
 *   ### Changed
 *   - bullet
 *
 * Usage:
 *   node scripts/extract-release-notes.mjs <version> [--summary] [--changelog <path>]
 *
 * --summary    Print only the summary paragraph (no headings, no bullets).
 *              Falls back to "Ditto vX.Y.Z" if the section has no summary.
 * --changelog  Path to the changelog file. Defaults to CHANGELOG.md.
 *
 * Exits 0 with the extracted text on stdout. Exits non-zero if the version is
 * not found in the changelog.
 */

import { readFileSync } from 'node:fs';
import { argv, exit, stderr, stdout } from 'node:process';

function parseArgs(args) {
  let version;
  let summary = false;
  let changelog = 'CHANGELOG.md';
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--summary') summary = true;
    else if (arg === '--changelog') changelog = args[++i];
    else if (!arg.startsWith('--') && !version) version = arg;
    else {
      stderr.write(`Unknown argument: ${arg}\n`);
      exit(2);
    }
  }
  if (!version) {
    stderr.write('Usage: extract-release-notes.mjs <version> [--summary] [--changelog <path>]\n');
    exit(2);
  }
  // Strip a leading "v" so callers can pass either "v2.14.3" or "2.14.3".
  if (version.startsWith('v')) version = version.slice(1);
  return { version, summary, changelog };
}

/**
 * Extract the lines belonging to a single version section from changelog text,
 * not including the version heading itself.
 */
function extractSection(markdown, version) {
  const lines = markdown.split('\n');
  const headingPattern = new RegExp(
    `^## \\[${version.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\]`,
  );
  const nextHeadingPattern = /^## \[/;
  let inSection = false;
  const out = [];
  for (const line of lines) {
    if (!inSection) {
      if (headingPattern.test(line)) {
        inSection = true;
        continue;
      }
    } else {
      if (nextHeadingPattern.test(line)) break;
      out.push(line);
    }
  }
  return inSection ? out : null;
}

/**
 * Pull the leading non-blank paragraph from a section, stopping at the first
 * `###` category heading or `-` bullet. Returns null if no summary paragraph.
 */
function extractSummary(sectionLines) {
  const paragraph = [];
  let started = false;
  for (const line of sectionLines) {
    const trimmed = line.trim();
    if (!started) {
      if (!trimmed) continue;
      // If the very first non-blank line is a heading or bullet, there's no summary.
      if (trimmed.startsWith('#') || trimmed.startsWith('- ')) return null;
      started = true;
      paragraph.push(trimmed);
      continue;
    }
    // We're inside the paragraph. A blank line, a heading, or a bullet ends it.
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('- ')) break;
    paragraph.push(trimmed);
  }
  return paragraph.length ? paragraph.join(' ') : null;
}

/** Trim leading and trailing blank lines from a list of lines. */
function trimBlankEdges(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start++;
  while (end > start && !lines[end - 1].trim()) end--;
  return lines.slice(start, end);
}

const { version, summary, changelog } = parseArgs(argv.slice(2));
const markdown = readFileSync(changelog, 'utf8');
const section = extractSection(markdown, version);

if (!section) {
  stderr.write(`Version ${version} not found in ${changelog}\n`);
  exit(1);
}

if (summary) {
  const text = extractSummary(section);
  stdout.write(text ?? `Ditto v${version}`);
  stdout.write('\n');
} else {
  const body = trimBlankEdges(section).join('\n');
  if (body) {
    stdout.write(body);
    stdout.write('\n');
  } else {
    stdout.write(`Ditto v${version}\n`);
  }
}
