"""
Utility functions for the DAON SDK.
"""

import hashlib


def generate_content_hash(content: str) -> str:
    """
    Generate a SHA-256 hash of content.

    Uses raw UTF-8 encoding with no normalization, matching the API's
    ``crypto.createHash('sha256').update(content, 'utf8').digest('hex')``
    exactly. Returns the hash prefixed with ``sha256:``.
    """
    hex_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
    return f"sha256:{hex_hash}"


def normalize_content(content: str) -> str:
    """
    Return content unchanged.

    The DAON API hashes raw content without normalization. This function
    exists for backwards compatibility but performs no transformation.
    Normalizing before hashing would produce a hash that does not match
    the API's record.
    """
    return content
