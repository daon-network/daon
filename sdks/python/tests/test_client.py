"""
Tests for the DAON Python SDK.

Uses requests-mock to intercept HTTP calls so no live server is needed.
"""

import hashlib
import pytest
import requests_mock as requests_mock_module

from daon.client import DAONClient, ValidationError
from daon.models import (
    ContentMetadata,
    EntityType,
    LiberationUseCase,
    ProtectionRequest,
    UseType,
    UsePurpose,
)
from daon.utils import generate_content_hash, normalize_content

# ---------------------------------------------------------------------------
# Test vectors
# ---------------------------------------------------------------------------

# Short content for hash-function tests (known SHA-256 vector)
HASH_TEST_CONTENT = "test"
HASH_TEST_HEX = hashlib.sha256(HASH_TEST_CONTENT.encode("utf-8")).hexdigest()
HASH_TEST = f"sha256:{HASH_TEST_HEX}"

# Content for HTTP tests — must be ≥ 10 chars to pass SDK validation
TEST_CONTENT = "test content for daon sdk integration tests"
TEST_HASH_HEX = hashlib.sha256(TEST_CONTENT.encode("utf-8")).hexdigest()
TEST_HASH = f"sha256:{TEST_HASH_HEX}"

PROTECT_RESPONSE = {
    "success": True,
    "contentHash": TEST_HASH_HEX,
    "verificationUrl": f"https://app.daon.network/verify/{TEST_HASH_HEX}",
    "timestamp": "2026-01-01T00:00:00.000Z",
    "license": "liberation_v1",
    "blockchainTx": None,
    "blockchain": {"enabled": False, "tx": None},
}

VERIFY_RESPONSE = {
    "success": True,
    "isValid": True,
    "contentHash": TEST_HASH_HEX,
    "license": "liberation_v1",
    "timestamp": "2026-01-01T00:00:00.000Z",
    "verificationUrl": f"https://app.daon.network/verify/{TEST_HASH_HEX}",
    "blockchain": {"enabled": False, "verified": False, "source": "database"},
}

API_URL = "https://api.daon.network"


# ---------------------------------------------------------------------------
# generate_content_hash / utils
# ---------------------------------------------------------------------------


def test_hash_matches_known_vector():
    assert generate_content_hash(HASH_TEST_CONTENT) == HASH_TEST


def test_hash_has_correct_format():
    h = generate_content_hash("anything")
    assert h.startswith("sha256:")
    assert len(h) == 7 + 64


def test_hash_no_whitespace_normalisation():
    assert generate_content_hash("foo  bar") != generate_content_hash("foo bar")


def test_hash_no_line_ending_normalisation():
    assert generate_content_hash("foo\r\nbar") != generate_content_hash("foo\nbar")


def test_hash_no_strip():
    assert generate_content_hash("  test  ") != generate_content_hash("test")


def test_normalize_content_is_identity():
    """normalize_content must be a no-op so hashes match the API."""
    s = "  hello\r\nworld  "
    assert normalize_content(s) == s


# ---------------------------------------------------------------------------
# DAONClient.generate_content_hash
# ---------------------------------------------------------------------------


def test_client_generate_hash_matches_utils():
    client = DAONClient()
    assert client.generate_content_hash(HASH_TEST_CONTENT) == generate_content_hash(HASH_TEST_CONTENT)


# ---------------------------------------------------------------------------
# check_liberation_compliance (pure — no network)
# ---------------------------------------------------------------------------


def make_use_case(entity="corporation", use="ai_training", purpose="profit", compensation=False):
    return LiberationUseCase(
        entity_type=EntityType(entity),
        use_type=UseType(use),
        purpose=UsePurpose(purpose),
        compensation=compensation,
    )


def test_blocks_corporate_ai_training_no_compensation():
    client = DAONClient()
    r = client.check_liberation_compliance(HASH_TEST, make_use_case())
    assert r.compliant is False
    assert "AI training" in r.reason or "ai_training" in r.reason.lower()


def test_blocks_corporate_profit_no_compensation():
    client = DAONClient()
    r = client.check_liberation_compliance(
        HASH_TEST, make_use_case(use="commercial", purpose="profit")
    )
    assert r.compliant is False


def test_allows_corporate_use_with_compensation():
    client = DAONClient()
    r = client.check_liberation_compliance(HASH_TEST, make_use_case(compensation=True))
    assert r.compliant is True


def test_allows_individual_personal_use():
    client = DAONClient()
    r = client.check_liberation_compliance(
        HASH_TEST,
        LiberationUseCase(
            entity_type=EntityType.INDIVIDUAL,
            use_type=UseType.PERSONAL,
            purpose=UsePurpose.EDUCATION,
            compensation=False,
        ),
    )
    assert r.compliant is True


def test_allows_nonprofit_humanitarian():
    client = DAONClient()
    r = client.check_liberation_compliance(
        HASH_TEST,
        LiberationUseCase(
            entity_type=EntityType.NONPROFIT,
            use_type=UseType.EDUCATION,
            purpose=UsePurpose.HUMANITARIAN,
            compensation=False,
        ),
    )
    assert r.compliant is True


# ---------------------------------------------------------------------------
# protect()
# ---------------------------------------------------------------------------


def test_protect_sends_content_not_hash(requests_mock):
    requests_mock.post(f"{API_URL}/api/v1/protect", json=PROTECT_RESPONSE, status_code=201)
    client = DAONClient()
    client.protect(ProtectionRequest(content=TEST_CONTENT))

    body = requests_mock.last_request.json()
    assert "content" in body
    assert body["content"] == TEST_CONTENT
    assert "content_hash" not in body
    assert "creator" not in body
    assert "platform" not in body


def test_protect_prefixes_content_hash_with_sha256(requests_mock):
    requests_mock.post(f"{API_URL}/api/v1/protect", json=PROTECT_RESPONSE, status_code=201)
    client = DAONClient()
    result = client.protect(ProtectionRequest(content=TEST_CONTENT))

    assert result.success is True
    assert result.content_hash == TEST_HASH


def test_protect_maps_blockchain_tx(requests_mock):
    resp = {**PROTECT_RESPONSE, "blockchainTx": "ABC123TX"}
    requests_mock.post(f"{API_URL}/api/v1/protect", json=resp, status_code=201)
    client = DAONClient()
    result = client.protect(ProtectionRequest(content=TEST_CONTENT))

    assert result.tx_hash == "ABC123TX"


def test_protect_raises_on_network_error():
    import requests
    client = DAONClient()
    client.session.mount("https://", _FailAdapter())
    with pytest.raises(Exception):
        client.protect(ProtectionRequest(content=TEST_CONTENT))


def test_protect_validates_empty_content():
    client = DAONClient()
    with pytest.raises(ValidationError):
        client._validate_content("")


def test_protect_validates_too_short():
    client = DAONClient()
    with pytest.raises(ValidationError):
        client._validate_content("short")


# ---------------------------------------------------------------------------
# verify()
# ---------------------------------------------------------------------------


def test_verify_strips_sha256_prefix_from_url(requests_mock):
    requests_mock.get(
        f"{API_URL}/api/v1/verify/{TEST_HASH_HEX}", json=VERIFY_RESPONSE
    )
    client = DAONClient()
    client.verify(TEST_HASH)

    assert requests_mock.last_request.path == f"/api/v1/verify/{TEST_HASH_HEX}"
    assert "sha256:" not in requests_mock.last_request.path


def test_verify_hashes_raw_content_when_not_prefixed(requests_mock):
    requests_mock.get(
        f"{API_URL}/api/v1/verify/{TEST_HASH_HEX}", json=VERIFY_RESPONSE
    )
    client = DAONClient()
    client.verify(TEST_CONTENT)

    assert requests_mock.last_request.path == f"/api/v1/verify/{TEST_HASH_HEX}"


def test_verify_maps_is_valid_to_verified(requests_mock):
    requests_mock.get(
        f"{API_URL}/api/v1/verify/{TEST_HASH_HEX}", json=VERIFY_RESPONSE
    )
    client = DAONClient()
    result = client.verify(TEST_HASH)

    assert result.verified is True
    assert result.license == "liberation_v1"


def test_verify_returns_false_on_404(requests_mock):
    requests_mock.get(
        f"{API_URL}/api/v1/verify/{TEST_HASH_HEX}", status_code=404
    )
    client = DAONClient()
    result = client.verify(TEST_HASH)

    assert result.verified is False


def test_verify_maps_is_valid_false(requests_mock):
    requests_mock.get(
        f"{API_URL}/api/v1/verify/{TEST_HASH_HEX}",
        json={**VERIFY_RESPONSE, "isValid": False},
    )
    client = DAONClient()
    result = client.verify(TEST_HASH)

    assert result.verified is False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class _FailAdapter:
    """Requests transport adapter that always raises a connection error."""
    def send(self, *args, **kwargs):
        import requests
        raise requests.exceptions.ConnectionError("simulated failure")

    def close(self):
        pass
