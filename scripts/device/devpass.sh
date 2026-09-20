#!/bin/sh
# Usage: devpass.sh <label>. Restarts Metro with the device-pass flag, launches, collects results.
set -u
LABEL=$1
cd "$(dirname "$0")/../.."
# PORT 8081, NOT 8082. A dev client built by `expo run:android` remembers the LAN URL it was
# built with (192.168.x.x:8081) and IGNORES `adb reverse`. Serving the device-pass bundle on
# 8082 meant the phone quietly loaded the ORDINARY bundle from 8081 instead: the pass never
# ran, nothing was logged, and the run looked like a hang. That cost three runs on 2026-09-18.
for P in 8081 8082; do
  PID=$(powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort $P -State Listen -ErrorAction SilentlyContinue).OwningProcess")
  [ -n "$PID" ] && taskkill //F //T //PID $PID >/dev/null 2>&1
done
sleep 2
EXPO_PUBLIC_DEVICE_PASS=1 npx expo start --dev-client --clear --port 8081 > /c/Temp/metro-dp-$LABEL.log 2>&1 &
until grep -q "Waiting on" /c/Temp/metro-dp-$LABEL.log; do sleep 2; done
# The dev client resolves localhost:8081 through this. It is cleared by a reconnect, a
# reboot, or an adb server restart, and when it is missing the app shows "Unable to load
# script" and logs NOTHING — so the pass just sits there until it times out and reports an
# empty result file, which looks exactly like a hang. Cost a run on 2026-09-20.
adb reverse tcp:8081 tcp:8081 >/dev/null 2>&1
adb logcat -c
adb shell am force-stop com.example.reader
adb shell monkey -p com.example.reader -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
for i in $(seq 1 150); do
  if adb logcat -d | grep -q "\[devcheck\] ===== RUNTIME"; then break; fi
  sleep 2
done
adb logcat -d | grep "\[devcheck\]" | sed 's/^.*\[devcheck\]/[devcheck]/' > /c/Temp/devpass-$LABEL.txt
grep -E "FAIL|=====|SQLite" /c/Temp/devpass-$LABEL.txt
