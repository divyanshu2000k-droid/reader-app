#!/bin/sh
# Wait until the phone is not in somebody's hands: our app, the launcher, or a dark screen.
# The owner picks the phone up mid-run (calls, WhatsApp, the camera). Scripts wait rather
# than fighting for the foreground.
for i in $(seq 1 ${2:-60}); do
  TOP=$(adb shell "dumpsys activity activities | grep -m1 topResumedActivity" 2>/dev/null | sed -n 's/.* \([A-Za-z0-9_.]*\)\/.*/\1/p')
  case "$TOP" in
    com.example.reader|*launcher*) echo "phone free (top=$TOP)"; exit 0;;
  esac
  if adb shell dumpsys power 2>/dev/null | grep -qm1 "mWakefulness=Asleep\|mWakefulness=Dozing"; then
    echo "screen off"; exit 0
  fi
  sleep 10
done
echo "still busy (top=$TOP)"; exit 1
