"""Pull sandbox.db with its sidecars (app force-stopped first) and run queries on the copy."""
import datetime
import os
import sqlite3
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')  # gitignored: never pull a database into a committable folder
PKG = 'com.example.reader'


def pull(dest='pulled'):
    subprocess.run(['adb', 'shell', 'am', 'force-stop', PKG], check=True)
    path = os.path.join(OUT, dest)
    os.makedirs(path, exist_ok=True)
    for suffix in ('', '-wal', '-shm'):
        out = os.path.join(path, f'sandbox.db{suffix}')
        r = subprocess.run(['adb', 'exec-out', 'run-as', PKG, 'cat', f'files/SQLite/sandbox.db{suffix}'], capture_output=True)
        with open(out, 'wb') as f:
            f.write(r.stdout)
    return sqlite3.connect(os.path.join(path, 'sandbox.db'))


def local(ms):
    # The phone is on Asia/Calcutta; show the instant in IST explicitly.
    ist = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
    return datetime.datetime.fromtimestamp(ms / 1000, ist).strftime('%Y-%m-%d %H:%M:%S IST')


if __name__ == '__main__':
    con = pull()
    for q in sys.argv[1:]:
        for row in con.execute(q):
            print(tuple(local(v) if isinstance(v, int) and v > 10**12 else v for v in row))
