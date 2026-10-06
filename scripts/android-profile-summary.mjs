#!/usr/bin/env node
/**
 * Summarize a scripts/android-profile.sh run: per scenario, the service's CPU,
 * heap and gauges from its ServiceProfiler dump, the costliest operations, the
 * frames it received by subscription family, and the headline lines from the
 * system dumps (the app's wakeup alarms, total PSS).
 *
 *   node scripts/android-profile-summary.mjs perf-reports/android-<timestamp>
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
if (!root || !existsSync(root)) {
  console.error("usage: android-profile-summary.mjs <perf-reports/android-…>");
  process.exit(2);
}

const read = (path) => (existsSync(path) ? readFileSync(path, "utf8") : "");

/**
 * The first complete JSON object in `text`: dumpsys may print more after the
 * service's own output, so match braces (outside strings) rather than parse
 * the whole file.
 */
function firstObject(text) {
  const start = text.indexOf("{");
  if (start < 0) return "";
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return "";
}

for (const scenario of readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory())) {
  const dir = join(root, scenario);
  console.log(`\n══ ${scenario} ══`);

  let svc;
  try {
    svc = JSON.parse(firstObject(read(join(dir, "service.json"))));
  } catch {
    console.log("  no service profile (is this the profiling build, and was the service running?)");
    continue;
  }
  console.log(
    `  window ${svc.windowSec}s · process CPU ${svc.cpuMs}ms (${svc.cpuPct}%) · java heap ${svc.javaHeapMB}MB · native heap ${svc.nativeHeapMB}MB`,
  );
  console.log(`  gauges ${JSON.stringify(svc.gauges)}`);

  const ops = Object.entries(svc.ops ?? {});
  const timed = ops.filter(([, o]) => o.totalMs !== undefined).slice(0, 15);
  if (timed.length) {
    console.log("  time by operation:");
    for (const [label, o] of timed) {
      console.log(`    ${String(o.totalMs).padStart(9)}ms  ×${String(o.count).padEnd(6)} max ${o.maxMs}ms  ${label}`);
    }
  }
  const counted = ops
    .filter(([label, o]) => o.totalMs === undefined && !label.startsWith("frame.in "))
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20);
  if (counted.length) {
    console.log("  counts:");
    for (const [label, o] of counted) {
      console.log(`    ×${String(o.count).padEnd(7)}${o.units ? ` ${o.units} units` : o.peak ? ` peak ${o.peak}` : ""}  ${label}`);
    }
  }
  const frames = ops
    .filter(([label]) => label.startsWith("frame.in "))
    .sort((a, b) => (b[1].units ?? 0) - (a[1].units ?? 0))
    .slice(0, 12);
  if (frames.length) {
    console.log("  frames in (by subscription family: dn notifications, dp profile lookups, de referenced events):");
    for (const [label, o] of frames) {
      console.log(`    ×${String(o.count).padEnd(7)}${String(Math.round((o.units ?? 0) / 1024)).padStart(6)}KB  ${label.slice(9)}`);
    }
  }

  const pss = /TOTAL PSS:\s*(\d+)/.exec(read(join(dir, "meminfo.txt"))) ?? /TOTAL\s+(\d+)/.exec(read(join(dir, "meminfo.txt")));
  if (pss) console.log(`  meminfo total PSS ${Math.round(Number(pss[1]) / 1024)}MB`);
  const alarms = read(join(dir, "alarm.txt"))
    .split("\n")
    .filter((l) => l.includes("pub.ditto.app") && /wakeup|alarm/i.test(l))
    .slice(0, 5);
  if (alarms.length) {
    console.log("  alarms:");
    for (const l of alarms) console.log(`    ${l.trim()}`);
  }
  const battery = read(join(dir, "batterystats.txt"))
    .split("\n")
    .filter((l) => /Wakeup alarm|Wake lock|Mobile radio active|Wifi|Estimated power use|Cpu:|Foreground service/i.test(l))
    .slice(0, 12);
  if (battery.length) {
    console.log("  batterystats:");
    for (const l of battery) console.log(`    ${l.trim()}`);
  }
}
console.log(`\nraw dumps: ${root}`);
