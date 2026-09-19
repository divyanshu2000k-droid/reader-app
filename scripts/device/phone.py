"""Drive the phone: dump the view tree, find nodes by text or content-desc, tap them."""
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

PKG = 'com.example.reader'

# Screenshots, pulled databases and run state go here, never beside the scripts: a pulled
# sandbox.db must not be committable. Gitignored.
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)


def adb(*args, check=True):
    r = subprocess.run(['adb', *args], capture_output=True, text=True, encoding='utf8', errors='replace')
    if check and r.returncode != 0:
        raise RuntimeError(f"adb {args}: {r.stderr}")
    return r.stdout


class ForeignScreen(Exception):
    """Something other than the app under test is on screen."""


def foreground():
    # One grep on the device rather than megabytes over USB: this runs before every dump.
    out = adb('shell', 'dumpsys activity activities | grep -m1 topResumedActivity', check=False)
    m = re.search(r'\s([A-Za-z0-9_.]+)/', out)
    return m.group(1) if m else None


def require_our_app():
    """
    Refuse to dump anything that is not our app.

    A dump captures every string on screen. On 2026-09-18 a run continued while the owner
    was in WhatsApp and a private conversation went into the session log. The phone belongs
    to the owner; a script that reads whatever happens to be in front of it is a script that
    reads their mail. Abort loudly instead.
    """
    # Two looks, because a launch legitimately shows the launcher for a moment. Anything
    # that is still in front 1.5s later is somebody's actual screen, not a transient.
    top = foreground()
    if top is None or top == PKG:
        return
    time.sleep(1.5)
    top = foreground()
    if top is None or top == PKG:
        return
    raise ForeignScreen(
        f'{top} is in the foreground, not {PKG}. Stopping rather than reading '
        "someone else's screen. Bring the app forward and re-run.")


# The ONLY packages that may be dumped besides our own, and only ever through
# `dump_permission_dialog` below. Android's permission dialog is raised BY our app, shows our
# app's name and two buttons, and contains nothing of the owner's. Nothing else goes on this
# list: `require_our_app` stays exactly as strict as it was written, because the run that put
# a private WhatsApp conversation into a session log is the reason it exists.
PERMISSION_UI = ('com.google.android.permissioncontroller',
                 'com.android.permissioncontroller')


def dump_permission_dialog():
    """
    Dump Android's own permission dialog, and nothing else.

    `require_our_app` refuses it, correctly — it is a different package. But the notification
    permission is a ONE-SHOT dialog: spend it and it never appears again short of a fresh
    install, so it has to be driven, not skipped. This refuses just as loudly for anything
    that is not the permission UI.
    """
    top = foreground()
    if top not in PERMISSION_UI:
        raise ForeignScreen(
            f'{top} is in the foreground, and it is not the permission dialog. '
            "Refusing to dump it.")
    adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml', check=False)
    xml = adb('shell', 'cat', '/sdcard/ui.xml')
    return ET.fromstring(xml[xml.find('<?xml'):])


def dump():
    require_our_app()
    adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml', check=False)
    xml = adb('shell', 'cat', '/sdcard/ui.xml')
    xml = xml[xml.find('<?xml'):]
    return ET.fromstring(xml)


def nodes(root):
    return list(root.iter('node'))


def label(n):
    return (n.get('text') or '') + '|' + (n.get('content-desc') or '')


def find(root, pattern):
    rx = re.compile(pattern)
    return [n for n in nodes(root) if rx.search(n.get('text') or '') or rx.search(n.get('content-desc') or '')]


def centre(n):
    a, b, c, d = map(int, re.findall(r'\d+', n.get('bounds')))
    return (a + c) // 2, (b + d) // 2


def tap_node(n):
    x, y = centre(n)
    adb('shell', 'input', 'tap', str(x), str(y))


def texts(root):
    return [label(n) for n in nodes(root) if (n.get('text') or n.get('content-desc'))]


def wait_for(pattern, timeout=10):
    end = time.time() + timeout
    while time.time() < end:
        root = dump()
        hit = find(root, pattern)
        if hit:
            return root, hit
        time.sleep(0.7)
    return dump(), []


class StepFailed(Exception):
    pass


def require(pattern, what, timeout=10):
    root, hit = wait_for(pattern, timeout)
    if not hit:
        print(f"  PRECONDITION FAILED: {what} (/{pattern}/ not on screen)")
        print("  screen:", texts(root)[:40])
        raise StepFailed(what)
    return root, hit


def tap(pattern, what, timeout=10, index=0):
    root, hit = require(pattern, what, timeout)
    tap_node(hit[index])
    return hit[index]


def screenshot(path):
    path = path if os.path.isabs(path) else os.path.join(OUT, path)
    with open(path, 'wb') as f:
        f.write(subprocess.run(['adb', 'exec-out', 'screencap', '-p'], capture_output=True).stdout)


if __name__ == '__main__':
    print("\n".join(texts(dump())))
