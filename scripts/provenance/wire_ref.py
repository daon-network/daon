"""Reference encoder for DAON provenance leaves. Generates the spec's test vectors."""
import hashlib, struct

H = lambda b: hashlib.sha256(b).digest()
hexs = lambda b: b.hex()

# Domain separation tags. Distinct prefixes stop a leaf preimage from ever being
# reinterpretable as an internal node (the RFC 6962 second-preimage concern).
T_LEAF, T_NODE, T_OBS, T_CONTENT = b'\x00', b'\x01', b'\x02', b'\x03'

INGRESS = {'unknown':0, 'keystroke_stream':1, 'paste':2, 'import':3, 'programmatic':4}
CHAIN   = {'bitcoin':1, 'daon':2}

def encode_observation(tool_id, ingress, added, removed, duration_ms, op_count):
    t = tool_id.encode('ascii')
    assert len(t) <= 64, 'tool_id max 64 bytes'
    return (b'\x01'
            + struct.pack('>H', len(t)) + t
            + bytes([INGRESS[ingress]])
            + struct.pack('>QQQQ', added, removed, duration_ms, op_count))

def meta_commit(**kw):        return H(T_OBS + encode_observation(**kw))
def content_commit(delta):    return H(T_CONTENT + delta)

def encode_leaf_body(seq, parent_head, content_commit, meta_commit,
                     beacon_chain, beacon_height, beacon_hash, author_key, local_time_ms):
    for n,v in (('parent_head',parent_head),('content_commit',content_commit),
                ('meta_commit',meta_commit),('beacon_hash',beacon_hash),('author_key',author_key)):
        assert len(v)==32, f'{n} must be 32 bytes'
    return (b'\x01'                                   # format version
            + struct.pack('>Q', seq)
            + parent_head + content_commit + meta_commit
            + bytes([CHAIN[beacon_chain]]) + struct.pack('>Q', beacon_height) + beacon_hash
            + author_key
            + struct.pack('>q', local_time_ms))       # signed: untrusted, may predate epoch

def leaf_id(**kw): return H(T_LEAF + encode_leaf_body(**kw))

def node(l, r):    return H(T_NODE + l + r)

def merkle_root(leaves):
    """RFC 6962 split: largest power of two strictly less than n.
    Not last-node duplication, which admits two trees with one root."""
    if not leaves: return H(b'')
    if len(leaves) == 1: return leaves[0]
    k = 1
    while k * 2 < len(leaves): k *= 2
    return node(merkle_root(leaves[:k]), merkle_root(leaves[k:]))

def inclusion_proof(leaves, i):
    if len(leaves) == 1: return []
    k = 1
    while k * 2 < len(leaves): k *= 2
    if i < k: return inclusion_proof(leaves[:k], i) + [(b'R', merkle_root(leaves[k:]))]
    return inclusion_proof(leaves[k:], i - k) + [(b'L', merkle_root(leaves[:k]))]

def verify_inclusion(leaf, proof, root):
    h = leaf
    for side, sib in proof:
        h = node(h, sib) if side == b'R' else node(sib, h)
    return h == root


if __name__ == '__main__':
    # Regenerates the test vectors in docs/design/wire-format.md §7.
    # Any second implementation is conforming when it reproduces these.
    obs = dict(tool_id='ref/1.0', ingress='paste', added=214, removed=12,
               duration_ms=45200, op_count=87)
    mc = meta_commit(**obs)
    cc = content_commit(b'the quick brown fox')
    g = dict(seq=0, parent_head=bytes(32), content_commit=cc, meta_commit=mc,
             beacon_chain='bitcoin', beacon_height=880000,
             beacon_hash=bytes.fromhex('00'*28 + 'deadbeef'),
             author_key=bytes.fromhex('11'*32), local_time_ms=1754000000000)
    leaves = [H(T_LEAF + bytes([i])) for i in range(5)]
    root = merkle_root(leaves)
    proof = inclusion_proof(leaves, 3)

    print('7.1 observation ', hexs(encode_observation(**obs)))
    print('7.1 meta_commit ', hexs(mc))
    print('7.2 content     ', hexs(cc))
    print('7.3 body        ', hexs(encode_leaf_body(**g)))
    print('7.3 leaf_id     ', hexs(leaf_id(**g)))
    for i, l in enumerate(leaves): print(f'7.4 leaf[{i}]     ', hexs(l))
    print('7.4 root        ', hexs(root))
    for s, sib in proof: print(f'7.5 {s.decode()}           ', hexs(sib))

    assert verify_inclusion(leaves[3], proof, root), 'proof must verify'
    assert not verify_inclusion(leaves[2], proof, root), 'wrong leaf must be rejected'
    assert len(encode_leaf_body(**g)) == 186, 'leaf body is fixed at 186 bytes'
    print('\nself-checks passed')
