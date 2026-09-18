"""Run a single mutation from devpass_s5b_mutations.py by its label prefix.

    python scripts/device/run_one_mutation.py s5bm3
"""

import importlib.util
import pathlib
import sys

sys.stdout.reconfigure(encoding='utf-8')

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('devmut', HERE / 'devpass_s5b_mutations.py')
mod = importlib.util.module_from_spec(spec)
# The module runs its whole sweep on import, so read its source and take only the pieces.
source = (HERE / 'devpass_s5b_mutations.py').read_text(encoding='utf-8')
head = source.split('before = {}')[0]
exec(compile(head, 'devmut', 'exec'), mod.__dict__)

want = sys.argv[1]
chosen = [r for r in mod.RUNS if r[0].startswith(want)]
if not chosen:
    print(f'no mutation matching {want}')
    sys.exit(2)

ok_all = True
for label, path, old, new in chosen:
    f = mod.ROOT / path
    original = f.read_bytes()
    digest = mod.digest(f)
    text = original.decode('utf8')
    assert text.count(old) == 1, (label, 'pattern found %d times' % text.count(old))
    f.write_bytes(text.replace(old, new, 1).encode('utf8'))
    wanted = '17.' if label.startswith(('s5bm1', 's5bm2')) else '18.'
    try:
        ok_all = mod.run(label, wanted) and ok_all
    finally:
        f.write_bytes(original)
        assert mod.digest(f) == digest, f'{path} was NOT written back'
print('source written back, md5 verified')
sys.exit(0 if ok_all else 1)
