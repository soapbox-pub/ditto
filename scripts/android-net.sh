#!/usr/bin/env bash
# Measure what the app sends and receives, against the kernel's own count.
#
#   scripts/android-net.sh --scenario cold --seconds 180
#   scripts/android-net.sh --scenario idle --seconds 600      # cold open, then idle on screen
#   scripts/android-net.sh --scenario bg --seconds 600        # foreground 20s, then backgrounded
#   scripts/android-net.sh --scenario off --seconds 1200      # backgrounded with the screen off
#   scripts/android-net.sh --scenario cold --repeat 5
#
# Needs the profiling APK (scripts/android-profile.sh --build): it is
# debuggable, so its WebView exposes DevTools and its service a profiler.
#
# Per run, under perf-reports/android-net-<timestamp>/<scenario>[-n]/:
#   k_start, k_end, k_series   the app UID's bytes from netstats (all networks)
#   net.jsonl                   every WebView frame/request (android-net-record.mjs)
#   prof.txt                    the notification service's ServiceProfiler dump
#   web.json                    the web runtime profiler (window.__dittoPerf, if present)
# then scripts/android-net-summary.mjs reconciles and attributes them.
set -euo pipefail
cd "$(dirname "$0")/.."

PKG="pub.ditto.app.profile"
SCENARIO="cold"
SECS=180
REPEAT=1
SERIAL="${ANDROID_SERIAL:-}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scenario) SCENARIO="$2"; shift ;;
    --seconds) SECS="$2"; shift ;;
    --repeat) REPEAT="$2"; shift ;;
    --serial) SERIAL="$2"; shift ;;
    --package) PKG="$2"; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
[[ "$SCENARIO" =~ ^(cold|idle|bg|off)$ ]] || { echo "unknown scenario: $SCENARIO" >&2; exit 2; }
[[ -n "$SERIAL" ]] && export ANDROID_SERIAL="$SERIAL"
adb get-state >/dev/null 2>&1 || { echo "No device; check \`adb devices\`." >&2; exit 1; }

SVC="$PKG/pub.ditto.app.NotificationRelayService"
APP_UID=$(adb shell pm list packages -U "$PKG" | grep -oE "uid:[0-9]+" | head -1 | cut -d: -f2)
[[ -n "$APP_UID" ]] || { echo "$PKG is not installed." >&2; exit 1; }
PORT=9334
ROOT="perf-reports/android-net-$(date +%Y%m%d-%H%M%S)"

# The UID's cumulative bytes "rxB rxP txB txP", every network, tag 0 (all traffic).
uid_bytes() {
  adb shell dumpsys netstats --poll >/dev/null 2>&1
  adb shell dumpsys netstats detail | awk -v u="uid=$APP_UID " '
    /ident=/ { x = index($0, u) > 0 && $0 ~ /tag=0x0$/; next }
    x && /st=/ { split($2,b,"="); split($3,c,"="); split($4,d,"="); split($5,e,"="); rb+=b[2]; rp+=c[2]; tb+=d[2]; tp+=e[2] }
    END { printf "%d %d %d %d\n", rb, rp, tb, tp }'
}

cleanup() { adb shell svc power stayon false >/dev/null 2>&1 || true; adb forward --remove tcp:$PORT >/dev/null 2>&1 || true; }
trap cleanup EXIT

run() {
  local out=$1
  mkdir -p "$out"
  adb forward --remove tcp:$PORT >/dev/null 2>&1 || true
  adb shell svc power stayon usb
  adb shell input keyevent KEYCODE_WAKEUP
  # bg/off measure the running app; cold/idle start from nothing.
  if [[ "$SCENARIO" == cold || "$SCENARIO" == idle ]]; then adb shell am force-stop "$PKG"; sleep 2; fi
  uid_bytes > "$out/k_start"
  local start; start=$(date +%s)
  adb shell am start -n "$PKG/pub.ditto.app.MainActivity" >/dev/null
  for _ in $(seq 1 50); do
    local pid; pid=$(adb shell pidof "$PKG" || true)
    [[ -n "$pid" ]] && adb forward tcp:$PORT "localabstract:webview_devtools_remote_$pid" >/dev/null 2>&1 \
      && curl -s "localhost:$PORT/json" | grep -q '"page"' && break
    sleep 0.2
  done
  node scripts/android-net-record.mjs $PORT "$SECS" "$out/net.jsonl" 2>"$out/record.err" &
  local rec=$!
  # A cold start's own service connects are part of the cost; a warm one starts clean.
  [[ "$SCENARIO" == bg || "$SCENARIO" == off ]] && adb shell dumpsys activity service "$SVC" reset >/dev/null
  if [[ "$SCENARIO" == bg || "$SCENARIO" == off ]]; then sleep 20; adb shell input keyevent KEYCODE_HOME; fi
  if [[ "$SCENARIO" == off ]]; then adb shell svc power stayon false; sleep 1; adb shell input keyevent KEYCODE_SLEEP; fi
  local end=$(( start + SECS ))
  : > "$out/k_series"
  while (( $(date +%s) < end )); do
    echo "$(( $(date +%s) - start )) $(uid_bytes)" >> "$out/k_series"
    sleep 50
  done
  wait $rec || true
  uid_bytes > "$out/k_end"
  adb shell dumpsys activity service "$SVC" > "$out/prof.txt" || true
  local ws; ws=$(curl -s "localhost:$PORT/json" | grep -m1 -oE 'ws://[^"]+page[^"]+' || true)
  [[ -n "$ws" ]] && timeout 20 node -e '
    const ws = new WebSocket(process.argv[1]);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: "window.__dittoPerf?.json?.()", returnByValue: true } }));
    ws.onmessage = (m) => { const r = JSON.parse(m.data); if (r.id === 1) { process.stdout.write(r.result?.result?.value ?? ""); process.exit(0); } };
  ' "$ws" > "$out/web.json" || true
  adb shell svc power stayon false
}

for i in $(seq 1 "$REPEAT"); do
  dir="$ROOT/$SCENARIO"; [[ "$REPEAT" -gt 1 ]] && dir="$dir-$i"
  echo "▶ $dir"
  run "$dir"
  node scripts/android-net-summary.mjs "$dir" --brief
  [[ "$i" -lt "$REPEAT" ]] && sleep 10
done
echo "Reports in $ROOT (node scripts/android-net-summary.mjs <dir> for the full attribution)."
