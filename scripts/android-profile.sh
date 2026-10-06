#!/usr/bin/env bash
# Measure the Android notification service on a real device, over adb.
#
#   scripts/android-profile.sh --build                  # build + install the profiling APK
#   scripts/android-profile.sh --scenario background --minutes 10
#   scripts/android-profile.sh --scenario all --minutes 10 --perfetto 60
#
# The profiling APK (`-PdittoProfile=true`, `VITE_PROFILE=1`) installs as
# pub.ditto.app.profile, BESIDE the real app — a debug-signed build can't
# replace a release install without wiping it. Open it once, log in and turn
# background notifications on; while measuring, keep the real app's
# notifications off (or force-stop it) so the two services don't share the
# radio and muddy the batterystats.
#
# Scenarios (each resets the service's counters first, then reads them back
# through `dumpsys activity service …NotificationRelayService`, which the
# profiling build answers with ServiceProfiler's JSON):
#   cold        force-stop, launch the app, wait 90s, background it — what one
#               app open costs the service (config reloads, reconnects, replay)
#   background  app backgrounded, screen on, for --minutes
#   doze        screen off and Doze forced, for --minutes
#   all         cold, then background, then doze
#
# Around each: process CPU (from the service), meminfo, alarms, and
# batterystats with the device treated as unplugged. --perfetto N also records
# a system trace (sched, binder, the app's trace sections) for the first N
# seconds of each scenario.
#
# Output: perf-reports/android-<timestamp>/<scenario>/ plus a summary on stdout.
set -euo pipefail

cd "$(dirname "$0")/.."

PKG="pub.ditto.app.profile"
SVC="$PKG/pub.ditto.app.NotificationRelayService"
SCENARIO=""
MINUTES=10
PERFETTO=0
BUILD=0
SERIAL="${ANDROID_SERIAL:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build) BUILD=1 ;;
    --scenario) SCENARIO="$2"; shift ;;
    --minutes) MINUTES="$2"; shift ;;
    --perfetto) PERFETTO="$2"; shift ;;
    --serial) SERIAL="$2"; shift ;;
    --package) PKG="$2"; SVC="$PKG/pub.ditto.app.NotificationRelayService"; shift ;;
    -h|--help) sed -n '2,31p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

ADB=(adb)
[[ -n "$SERIAL" ]] && ADB=(adb -s "$SERIAL")
sh_() { "${ADB[@]}" shell "$@"; }

if ! "${ADB[@]}" get-state >/dev/null 2>&1; then
  echo "No device. Connect one (USB debugging, or \`adb pair\` + \`adb connect\` for wireless) and check \`adb devices\`." >&2
  exit 1
fi

if [[ "$BUILD" == 1 ]]; then
  echo "▶ building the profiling web bundle and APK…"
  VITE_PROFILE=1 npm run build
  npx cap sync android && node scripts/patch-cap-config.mjs
  (cd android && ./gradlew :app:assembleDebug -PdittoProfile=true)
  "${ADB[@]}" install -r android/app/build/outputs/apk/debug/app-debug.apk
  echo "Installed $PKG. Open it, log in, enable background notifications, then run a --scenario."
  [[ -z "$SCENARIO" ]] && exit 0
fi

[[ -z "$SCENARIO" ]] && { echo "nothing to do: pass --build and/or --scenario" >&2; exit 2; }
sh_ pm path "$PKG" >/dev/null 2>&1 || { echo "$PKG is not installed; run with --build first." >&2; exit 1; }

OUT="perf-reports/android-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"
sh_ getprop ro.product.model > "$OUT/device.txt"
sh_ getprop ro.build.version.release >> "$OUT/device.txt"

# The service's JSON: `dumpsys activity service` wraps it in a header and
# indents it, so keep everything from the first line that opens the object.
service_json() {
  sh_ dumpsys activity service "$SVC" "$@" | sed 's/^[[:space:]]*//' | sed -n '/^{/,$p'
}

reset_all() {
  service_json reset >/dev/null
  sh_ dumpsys batterystats --reset >/dev/null
  sh_ dumpsys batterystats --enable full-wake-history >/dev/null
  # Batterystats only accrues per-app power while "on battery".
  sh_ dumpsys battery unplug >/dev/null
}

start_perfetto() {
  local dir="$1"
  [[ "$PERFETTO" -gt 0 ]] || return 0
  sh_ rm -f /data/misc/perfetto-traces/ditto.pftrace >/dev/null 2>&1 || true
  sh_ perfetto -o /data/misc/perfetto-traces/ditto.pftrace -t "${PERFETTO}s" \
    sched freq idle am wm binder_driver dalvik -a "$PKG" --background >/dev/null
  echo "$dir" > "$OUT/.perfetto-pending"
}

collect() {
  local dir="$1"
  service_json > "$dir/service.json"
  sh_ dumpsys meminfo "$PKG" > "$dir/meminfo.txt" || true
  sh_ dumpsys alarm > "$dir/alarm.txt" || true
  sh_ dumpsys batterystats "$PKG" > "$dir/batterystats.txt" || true
  sh_ dumpsys cpuinfo > "$dir/cpuinfo.txt" || true
  sh_ dumpsys battery reset >/dev/null
  if [[ -f "$OUT/.perfetto-pending" ]]; then
    # --background returns at once; the trace finishes on its own clock.
    sleep 2
    "${ADB[@]}" pull /data/misc/perfetto-traces/ditto.pftrace "$dir/trace.perfetto-trace" >/dev/null 2>&1 \
      && echo "   trace: $dir/trace.perfetto-trace (open in ui.perfetto.dev)"
    rm -f "$OUT/.perfetto-pending"
  fi
}

wait_minutes() {
  local total=$(( $1 * 60 )) step=30 waited=0
  while (( waited < total )); do
    sleep "$step"; waited=$(( waited + step ))
    printf "\r   %d/%ds" "$waited" "$total"
  done
  echo
}

run_cold() {
  local dir="$OUT/cold"; mkdir -p "$dir"
  echo "▶ cold: force-stop, launch, 90s, background"
  sh_ am force-stop "$PKG"
  sh_ monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
  # The service starts with the app; give it a moment to exist before the reset.
  sleep 5
  reset_all
  start_perfetto "$dir"
  sleep 85
  sh_ input keyevent KEYCODE_HOME
  sleep 5
  collect "$dir"
}

run_background() {
  local dir="$OUT/background"; mkdir -p "$dir"
  echo "▶ background: app in the background, screen on, ${MINUTES}min"
  sh_ input keyevent KEYCODE_WAKEUP
  sh_ input keyevent KEYCODE_HOME
  sleep 5
  reset_all
  start_perfetto "$dir"
  wait_minutes "$MINUTES"
  collect "$dir"
}

run_doze() {
  local dir="$OUT/doze"; mkdir -p "$dir"
  echo "▶ doze: screen off, Doze forced, ${MINUTES}min"
  sh_ input keyevent KEYCODE_HOME
  sh_ input keyevent KEYCODE_SLEEP
  sleep 5
  reset_all
  sh_ dumpsys deviceidle force-idle >/dev/null
  start_perfetto "$dir"
  wait_minutes "$MINUTES"
  sh_ dumpsys deviceidle unforce >/dev/null
  sh_ input keyevent KEYCODE_WAKEUP
  collect "$dir"
}

case "$SCENARIO" in
  cold) run_cold ;;
  background) run_background ;;
  doze) run_doze ;;
  all) run_cold; run_background; run_doze ;;
  *) echo "unknown scenario: $SCENARIO" >&2; exit 2 ;;
esac

node scripts/android-profile-summary.mjs "$OUT"
