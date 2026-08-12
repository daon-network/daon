#!/usr/bin/env python3
"""Emit the wire-format vectors as `name<TAB>hex`, matching the Rust example.

Exists so CI can diff the two implementations. The unit tests on each side
assert hardcoded expectations, so they would both keep passing if one drifted --
each checking itself proves nothing about the format. This is the check that
catches a fork.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wire_ref import *  # noqa: F403

o1 = dict(tool_id='ref/1.0', ingress='paste', added=214, removed=12,
          duration_ms=45200, op_count=87)
o2 = dict(tool_id='ref/1.0', ingress='keystroke_stream', added=1180, removed=96,
          duration_ms=51000, op_count=1431)
mc2 = meta_commit([o1, o2])
cc = content_commit(b'the quick brown fox')
leaf = dict(seq=0, parent_head=bytes(32), content_commit=cc, meta_commit=mc2,
            beacon_chain='bitcoin', beacon_height=880000,
            beacon_hash=bytes.fromhex('00' * 28 + 'deadbeef'),
            author_key=bytes.fromhex('11' * 32),
            recovery_key=bytes.fromhex('22' * 32),
            local_time_ms=1754000000000)
leaves = [H(T_LEAF + bytes([i])) for i in range(5)]
root = merkle_root(leaves)
proof = inclusion_proof(leaves, 3)
seg_doc = b''.join(bytes([i]) * 1024 for i in (1, 2, 3))

out = [
    ('observation0', hexs(encode_observation(**o1))),
    ('obs_leaf0', hexs(observation_leaf(**o1))),
    ('obs_leaf1', hexs(observation_leaf(**o2))),
    ('meta_commit1', hexs(meta_commit([o1]))),
    ('meta_commit2', hexs(mc2)),
    ('content_commit', hexs(cc)),
    ('seg_root', hexs(content_commit(seg_doc))),
    ('leaf_body', hexs(encode_leaf_body(**leaf))),
    ('leaf_id', hexs(leaf_id(**leaf))),
]
out += [(f'leaf{i}', hexs(l)) for i, l in enumerate(leaves)]
out.append(('merkle_root', hexs(root)))
out += [(f'proof{i}', f'{s.decode()}:{hexs(h)}') for i, (s, h) in enumerate(proof)]

for name, value in out:
    print(f'{name}\t{value}')
