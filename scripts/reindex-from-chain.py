#!/usr/bin/env python3
"""
DAON Reindex Script
Scans all blockchain transactions and rebuilds the protected_content table.
Run on the server: python3 /opt/daon/scripts/reindex-from-chain.py
"""

import json
import base64
import urllib.request
import subprocess
import sys
import re
from datetime import datetime, timezone

RPC = "http://localhost:26657"
PER_PAGE = 100
CONTAINER = "daon-postgres"
DB_USER = "daon_api"
DB_NAME = "daon_production"
MSG_TYPE_URL = "/daoncore.contentregistry.v1.MsgRegisterContent"


def fetch_json(url):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def decode_varint(data, pos):
    """Decode a protobuf varint starting at pos. Returns (value, new_pos)."""
    result = 0
    shift = 0
    while pos < len(data):
        b = data[pos]
        result |= (b & 0x7F) << shift
        pos += 1
        if (b & 0x80) == 0:
            break
        shift += 7
    return result, pos


def decode_length_delimited(data, pos):
    """Decode a length-delimited field. Returns (bytes, new_pos)."""
    length, pos = decode_varint(data, pos)
    return data[pos:pos + length], pos + length


def parse_protobuf_strings(data):
    """Parse a simple protobuf message with only string fields.
    Returns dict of field_number -> bytes."""
    fields = {}
    pos = 0
    while pos < len(data):
        try:
            tag, pos = decode_varint(data, pos)
            field_number = tag >> 3
            wire_type = tag & 0x07
            if wire_type == 2:  # length-delimited
                value, pos = decode_length_delimited(data, pos)
                fields[field_number] = value
            elif wire_type == 0:  # varint
                _, pos = decode_varint(data, pos)
            elif wire_type == 1:  # 64-bit
                pos += 8
            elif wire_type == 5:  # 32-bit
                pos += 4
            else:
                break
        except (IndexError, ValueError):
            break
    return fields


def parse_tx(tx_base64):
    """Parse a cosmos transaction and extract MsgRegisterContent + memo."""
    raw = base64.b64decode(tx_base64)

    # TxRaw: field 1 = bodyBytes, field 2 = authInfoBytes, field 3 = signatures
    tx_raw_fields = parse_protobuf_strings(raw)
    body_bytes = tx_raw_fields.get(1, b"")
    if not body_bytes:
        return None

    # TxBody: field 1 = messages (repeated Any), field 2 = memo
    # Parse TxBody manually to handle repeated messages
    pos = 0
    messages_raw = []
    memo = ""
    while pos < len(body_bytes):
        try:
            tag, pos = decode_varint(body_bytes, pos)
            field_number = tag >> 3
            wire_type = tag & 0x07
            if wire_type == 2:
                value, pos = decode_length_delimited(body_bytes, pos)
                if field_number == 1:
                    messages_raw.append(value)
                elif field_number == 2:
                    memo = value.decode("utf-8", errors="replace")
            elif wire_type == 0:
                _, pos = decode_varint(body_bytes, pos)
            else:
                break
        except (IndexError, ValueError):
            break

    # Parse each message as google.protobuf.Any: field 1 = typeUrl, field 2 = value
    for msg_any_bytes in messages_raw:
        any_fields = parse_protobuf_strings(msg_any_bytes)
        type_url = any_fields.get(1, b"").decode("utf-8", errors="replace")
        if type_url != MSG_TYPE_URL:
            continue

        msg_value = any_fields.get(2, b"")
        if not msg_value:
            continue

        # MsgRegisterContent: 1=creator, 2=contentHash, 3=license, 4=fingerprint, 5=platform
        msg_fields = parse_protobuf_strings(msg_value)
        creator = msg_fields.get(1, b"").decode("utf-8", errors="replace")
        content_hash = msg_fields.get(2, b"").decode("utf-8", errors="replace")
        license_val = msg_fields.get(3, b"").decode("utf-8", errors="replace")
        fingerprint = msg_fields.get(4, b"").decode("utf-8", errors="replace")
        platform = msg_fields.get(5, b"").decode("utf-8", errors="replace")

        # Extract title from memo ("Register content: <title>")
        title = ""
        if memo.startswith("Register content: "):
            title = memo[len("Register content: "):]

        # Strip sha256: prefix for the DB column
        db_hash = content_hash
        if db_hash.startswith("sha256:"):
            db_hash = db_hash[7:]

        return {
            "content_hash": db_hash,
            "license": license_val,
            "fingerprint": fingerprint,
            "platform": platform,
            "title": title,
            "creator_address": creator,
        }

    return None


def get_block_time(height):
    """Get block timestamp from chain."""
    try:
        data = fetch_json(f"{RPC}/block?height={height}")
        time_str = data["result"]["block"]["header"]["time"]
        # Parse ISO timestamp
        return time_str
    except Exception as e:
        print(f"  Warning: could not get block time for height {height}: {e}", file=sys.stderr)
        return None


def psql(sql):
    """Run SQL via docker exec."""
    result = subprocess.run(
        ["docker", "exec", "-i", CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-t", "-A"],
        input=sql,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"  SQL error: {result.stderr.strip()}", file=sys.stderr)
    return result.stdout.strip()


def escape_sql(s):
    """Escape a string for SQL."""
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def main():
    # Get total tx count
    data = fetch_json(f'{RPC}/tx_search?query="tx.height>0"&per_page=1&page=1')
    total = int(data["result"]["total_count"])
    print(f"Total transactions on chain: {total}")

    pages = (total + PER_PAGE - 1) // PER_PAGE
    inserted = 0
    skipped = 0
    errors = 0

    for page in range(1, pages + 1):
        print(f"\nPage {page}/{pages}...")
        data = fetch_json(
            f'{RPC}/tx_search?query="tx.height>0"&per_page={PER_PAGE}&page={page}&order_by="asc"'
        )
        txs = data["result"]["txs"]

        for tx in txs:
            tx_hash = tx["hash"]
            height = tx["height"]
            tx_b64 = tx["tx"]

            parsed = parse_tx(tx_b64)
            if not parsed:
                skipped += 1
                continue

            # Get block timestamp
            block_time = get_block_time(height)

            content_hash = parsed["content_hash"]
            title = parsed["title"]
            license_val = parsed["license"]

            # Insert into protected_content (skip duplicates)
            sql = f"""
INSERT INTO protected_content (content_hash, title, license, blockchain_tx, blockchain_height, created_at, updated_at)
VALUES ({escape_sql(content_hash)}, {escape_sql(title)}, {escape_sql(license_val)},
        {escape_sql(tx_hash)}, {height},
        {escape_sql(block_time) if block_time else 'NOW()'},
        {escape_sql(block_time) if block_time else 'NOW()'})
ON CONFLICT (content_hash) DO UPDATE SET
    blockchain_tx = EXCLUDED.blockchain_tx,
    blockchain_height = EXCLUDED.blockchain_height,
    title = COALESCE(NULLIF(EXCLUDED.title, ''), protected_content.title),
    updated_at = EXCLUDED.updated_at;
"""
            result = psql(sql)
            inserted += 1
            if inserted % 50 == 0:
                print(f"  Processed {inserted} content registrations...")

    print(f"\nReindex complete!")
    print(f"  Inserted/updated: {inserted}")
    print(f"  Skipped (non-content txs): {skipped}")

    # Print summary
    count = psql("SELECT count(*) FROM protected_content;")
    print(f"  Total rows in protected_content: {count}")


if __name__ == "__main__":
    main()
