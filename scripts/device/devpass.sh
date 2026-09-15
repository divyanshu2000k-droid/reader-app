#!/bin/sh
# Usage: devpass.sh <label>. Restarts Metro with the device-pass flag, launches, collects results.
set -u
LABEL=$1
cd "$(dirname "$0")/../.."
PID=$(powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 8082 -State Listen -ErrorAction SilentlyContinue).OwningProcess")
[ -n "$PID" ] && taskkill //F //T //PID $PID >/dev/null 2>&1
sleep 2
EXPO_PUBLIC_DEVICE_PASS=1 npx expo start --dev-client --clear --port 8082 > /c/Temp/metro-dp-$LABEL.log 2>&1 &
until grep -q "Waiting on" /c/Temp/metro-dp-$LABEL.log; do sleep 2; done
adb logcat -c
adb shell am force-stop com.example.reader
adb shell monkey -p com.example.reader -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
for i in $(seq 1 150); do
  if adb logcat -d | grep -q "\[devcheck\] ===== RUNTIME"; then break; fi
  sleep 2
done
adb logcat -d | grep "\[devcheck\]" | sed 's/^.*\[devcheck\]/[devcheck]/' > /c/Temp/devpass-$LABEL.txt
grep -E "FAIL|=====|SQLite" /c/Temp/devpass-$LABEL.txt
