"""
Mutation sweep for Slice 6: break each timer rule on purpose and confirm a test goes red.

Same contract as mutate_s5b.py — bytes in, bytes out, md5 verified, non-zero exit if any
mutation survives or stops matching.

    python scripts/device/mutate_s6.py
"""

import hashlib
import subprocess
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parents[2]

PRIME = 'src/features/timer/primeDecision.ts'
PRIME_T = 'src/features/timer/__tests__/primeDecision.test.ts'
NOTICE = 'src/ui/timerNotice.ts'
NOTICE_T = 'src/ui/__tests__/timerNotification.test.ts'
STATE = 'src/domain/timerState.ts'
RUN = 'src/domain/timerRun.ts'
STATE_T = 'src/domain/__tests__/timerState.test.ts'
RUN_T = 'src/domain/__tests__/timerRun.test.ts'

MUTATIONS = [
    # ── The number is derived, and paused time is not reading ──
    ("elapsed counts wall time, ignoring pauses",
     STATE, "    total += span(s.startedAt, s.endedAt ?? now)",
     "    total += span(session.segments[0].startedAt, now)", STATE_T),
    ("a backwards clock produces a negative duration",
     STATE, "  return Math.max(0, to - from)", "  return to - from", STATE_T),
    ("a nonsense timestamp becomes NaN instead of nothing",
     STATE, "  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0", "  if (false) return 0", STATE_T),
    ("seconds round UP, claiming a second that was not read",
     STATE, "  return Math.floor(total / 1000)", "  return Math.ceil(total / 1000)", STATE_T),
    ("pausing on a backwards clock writes a segment that runs in reverse",
     STATE, "    endedAt: Math.max(last.startedAt, now),", "    endedAt: now,", STATE_T),
    ("a second Pause tap is treated as a new transition",
     STATE, "  if (status(session) !== 'running') return null", "  if (false) return null", STATE_T),
    ("a second Resume tap opens a second segment",
     STATE, "  if (status(session) === 'running') return null", "  if (false) return null", STATE_T),

    # ── What the reader sees ──
    ("the clock loses its zero padding",
     STATE, "  const ss = String(seconds).padStart(2, '0')", "  const ss = String(seconds)", STATE_T),
    ("the ring WRAPS past an hour, looking like a restarted timer",
     STATE, "  return Math.min(1, totalSeconds / RING_SWEEP_SECONDS)",
     "  return (totalSeconds % RING_SWEEP_SECONDS) / RING_SWEEP_SECONDS", STATE_T),

    # ── The heartbeat, and the bound it puts on a crash ──
    # Both of these were SKIPPED on 2026-09-19 — "pattern gone" — because `recoveryBoundAt`
    # was rewritten to take the native heartbeat as well. The sweep reporting SKIP rather
    # than a green pass is the whole reason it is trusted; re-pointed at the new source and
    # re-watched failing the same day.
    ("THE HEARTBEAT IS IGNORED and the bound falls back to now",
     RUN, "  const known = Math.max(stored, native)", "  const known = 0", RUN_T),
    ("a heartbeat from the future is trusted past now",
     RUN, "  return Math.min(known, now)", "  return known", RUN_T),
    ("the NATIVE heartbeat is thrown away, so a backgrounded session bounds to nothing",
     RUN, "  const native = Number.isFinite(nativeBeatAt) ? nativeBeatAt : 0",
     "  const native = 0", RUN_T),
    ("a recovered session is capped at how long the APP lived, not how long it existed",
     'src/features/launch/recoveryPolicy.ts',
     "  const maxMinutes = Math.max(1, Math.floor(wall / 60))",
     "  const maxMinutes = Math.max(1, Math.floor(bounded / 60))",
     'src/features/launch/__tests__/recoveryPolicy.test.ts'),
    ("a beat timestamped in the future is never due again",
     RUN, "  if (run.lastBeatAt > now) return true", "  if (false) return true", RUN_T),
    ("the first beat is never due",
     RUN, "  if (run.lastBeatAt === null || !Number.isFinite(run.lastBeatAt)) return true",
     "  if (false) return true", RUN_T),
    ("a corrupt stored run is trusted instead of discarded",
     RUN, "  if (!Array.isArray(segments) || !segments.every(isSegment)) return null",
     "  if (false) return null", RUN_T),
    ("a run with the wrong field types is half-read",
     RUN, "  if (typeof sessionId !== 'string' || typeof readId !== 'string') return null",
     "  if (false) return null", RUN_T),
    # ── Added 2026-09-19, for the five bugs the phone found ──
    ("the priming sheet forgets that the reader already declined",
     PRIME, "  if (inputs.askedBefore) return false",
     "  if (false) return false", PRIME_T),
    ("priming asks again after Android has permanently refused",
     PRIME, "  if (inputs.status !== 'undetermined' && !inputs.canAskAgain) return false",
     "  if (false) return false", PRIME_T),
    ("the notification claims to be a live clock",
     NOTICE, "      ? `${notice.title} · ${elapsed} so far`",
     "      ? `${notice.title} · ${elapsed}`", NOTICE_T),
    ("a paused timer still says Reading",
     NOTICE, "    title: notice.running ? 'Reading' : 'Paused',",
     "    title: 'Reading',", NOTICE_T),
    ("the Finish button's identifier drifts from the Kotlin",
     NOTICE, "  finish: 'timer-finish',",
     "  finish: 'timer_finish',", NOTICE_T),
]


def restore(path, original, label):
    """
    Put a mutated file back, and REFUSE to continue quietly if it cannot be put back.

    On 2026-09-18 a run died with `OSError: [Errno 22] Invalid argument` while writing —
    a transient Windows lock, almost certainly from the `tsx` process still holding the file —
    and the mutation was left in the source. The suite then failed on the next run and the
    cause took a diff to find.

    Windows file locks are transient, so retry; if it still will not write, say so loudly and
    name the git command that fixes it, rather than exiting with the tree broken.
    """
    for attempt in range(5):
        try:
            path.write_bytes(original)
            if path.read_bytes() == original:
                return
        except OSError:
            pass
        time.sleep(0.4 * (attempt + 1))
    raise SystemExit(
        f"\n!!! COULD NOT RESTORE {path} after mutation {label!r}.\n"
        f"!!! THE SOURCE IS STILL MUTATED. Run:  git checkout -- {path}\n"
    )


def digest(path):
    return hashlib.md5(path.read_bytes()).hexdigest()


def run_suite(suite):
    r = subprocess.run(['npx', 'tsx', '--test', suite], cwd=ROOT,
                       capture_output=True, text=True, shell=True)
    return r.returncode == 0


red, survived = 0, []
for label, rel, find, replace, suite in MUTATIONS:
    path = ROOT / rel
    original = path.read_bytes()
    before = digest(path)
    text = original.decode('utf-8')
    if find not in text:
        print(f'SKIP  {label}\n      (pattern gone from {rel} — re-watch it)')
        survived.append(label)
        continue
    path.write_bytes(text.replace(find, replace, 1).encode('utf-8'))
    try:
        passed = run_suite(suite)
    finally:
        restore(path, original, label)
        assert digest(path) == before, f'{rel} not restored byte for byte'
    if passed:
        print(f'GREEN {label}  <-- not caught')
        survived.append(label)
    else:
        red += 1
        print(f'RED   {label}')

print(f'\n{red}/{len(MUTATIONS)} mutations went red.')
for label in survived:
    print(f'  NOT CAUGHT: {label}')
sys.exit(0 if red == len(MUTATIONS) else 1)
