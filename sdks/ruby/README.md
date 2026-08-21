# DAON Ruby SDK

Register and verify content with [DAON](https://daon.network).

```bash
gem install daon-sdk
```

```ruby
require 'daon'

client = Daon::Client.new(api_url: 'https://api.daon.network')
result = client.protect(content: '…', license: 'liberation_v1')
puts result.content_commit
```

## What this returns

A **content commitment** — the identity DAON records for your work. It is a
Merkle root over 1 KiB segments of the content, defined in
[`wire-format.md`](https://github.com/daon-network/daon/blob/main/docs/design/wire-format.md)
§6, and it is the same value the local provenance agent computes for the same
bytes.

Blockchain transaction details are returned when available, but they are
incidental: the commitment is what identifies the work.

## Status

Early. See [the repository](https://github.com/daon-network/daon) for what works.
