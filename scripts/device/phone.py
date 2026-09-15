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


def dump():
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
