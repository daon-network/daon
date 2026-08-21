"""
DAON client implementation.
"""

import hashlib
import time
from typing import Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .models import (
    ContentMetadata,
    ProtectionRequest,
    ProtectionResult,
    VerificationResult,
    LiberationUseCase,
    LiberationCheckResult,
)


class DAONError(Exception):
    """Base exception for DAON SDK errors."""


class NetworkError(DAONError):
    """Network or connectivity error."""


class ValidationError(DAONError):
    """Input validation error."""


class ProtectionError(DAONError):
    """Content protection error."""


class DAONClient:
    """Client for the DAON content protection API."""

    DEFAULT_API_URL = "https://api.daon.network"
    DEFAULT_TIMEOUT = 30
    DEFAULT_RETRIES = 3
    DEFAULT_LICENSE = "liberation_v1"

    def __init__(
        self,
        api_url: str = DEFAULT_API_URL,
        timeout: int = DEFAULT_TIMEOUT,
        retries: int = DEFAULT_RETRIES,
        default_license: str = DEFAULT_LICENSE,
    ):
        self.api_url = api_url.rstrip("/")
        self.timeout = timeout
        self.default_license = default_license

        # Set up session with retry logic for transient failures
        self.session = requests.Session()
        retry = Retry(
            total=retries,
            backoff_factor=1,
            status_forcelist=[500, 502, 503, 504],
            allowed_methods=["GET", "POST"],
        )
        adapter = HTTPAdapter(max_retries=retry)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)
        self.session.headers.update(
            {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "DAON-Python-SDK/1.0.0",
            }
        )

    def protect(self, request: ProtectionRequest) -> ProtectionResult:
        """Protect content with DAON blockchain."""
        self._validate_content(request.content)

        license_ = request.license or self.default_license
        metadata_dict = (
            request.metadata.to_dict() if isinstance(request.metadata, ContentMetadata) else request.metadata or {}
        )

        payload = {
            "content": request.content,
            "metadata": metadata_dict,
            "license": license_,
        }

        try:
            response = self.session.post(
                f"{self.api_url}/api/v1/protect",
                json=payload,
                timeout=self.timeout,
            )
            response.raise_for_status()
            data = response.json()

            api_hash = data.get("contentHash")
            content_hash = f"sha256:{api_hash}" if api_hash else self.generate_content_hash(request.content)
            blockchain_tx = data.get("blockchainTx") or (data.get("blockchain") or {}).get("tx")

            return ProtectionResult(
                success=data.get("success", False),
                content_commit=content_hash,
                tx_hash=blockchain_tx,
                verification_url=data.get("verificationUrl"),
            )

        except requests.exceptions.RequestException as e:
            raise NetworkError(f"Failed to connect to DAON network: {e}") from e

    def verify(self, content_or_hash: str) -> VerificationResult:
        """Verify content protection status.

        Given a ``sha256:`` value, that value is looked up directly. Given
        content, the content is **sent to the server**, which computes the
        commitment.

        It used to hash locally, and the local hash did not match what the
        server records -- the server canonicalises first. So verifying a work by
        its content reported "not registered" for content that was registered,
        which is the worst answer this method can give.
        """
        if content_or_hash.startswith("sha256:"):
            content_hash = content_or_hash
        else:
            return self._verify_content(content_or_hash)

        # API expects 64-char hex only — strip sha256: prefix
        api_hash = content_hash[7:] if content_hash.startswith("sha256:") else content_hash

        try:
            response = self.session.get(
                f"{self.api_url}/api/v1/verify/{api_hash}",
                timeout=self.timeout,
            )

            if response.status_code == 404:
                return VerificationResult(verified=False, content_commit=content_hash)

            response.raise_for_status()
            data = response.json()

            return VerificationResult(
                verified=data.get("isValid", False),
                content_commit=content_hash,
                license=data.get("license"),
                timestamp=_parse_timestamp(data.get("timestamp")),
                verification_url=data.get("verificationUrl"),
            )

        except requests.exceptions.RequestException as e:
            raise NetworkError(f"Failed to connect to DAON network: {e}") from e

    def _verify_content(self, content: str) -> VerificationResult:
        """Ask the server what this content commits to, and whether it is known."""
        try:
            response = self.session.post(
                f"{self.api_url}/api/v1/verify-content",
                json={"content": content},
                timeout=self.timeout,
            )
            data = response.json() if response.content else {}
            commit = data.get("contentHash") or ""
            if commit and not commit.startswith("sha256:"):
                commit = f"sha256:{commit}"

            if response.status_code == 404:
                return VerificationResult(verified=False, content_commit=commit)
            response.raise_for_status()

            return VerificationResult(
                verified=data.get("isValid", False),
                content_commit=commit,
                license=data.get("license"),
                timestamp=_parse_timestamp(data.get("timestamp")),
                verification_url=data.get("verificationUrl"),
            )
        except requests.RequestException as exc:
            raise NetworkError(f"Verification failed: {exc}") from exc

    def check_liberation_compliance(
        self, content_hash: str, use_case: LiberationUseCase
    ) -> LiberationCheckResult:
        """Check Liberation License compliance (evaluated locally — no API endpoint)."""
        entity_type = use_case.entity_type.value if hasattr(use_case.entity_type, "value") else use_case.entity_type
        use_type = use_case.use_type.value if hasattr(use_case.use_type, "value") else use_case.use_type
        purpose = use_case.purpose.value if hasattr(use_case.purpose, "value") else use_case.purpose
        compensation = use_case.compensation

        if entity_type == "corporation" and use_type == "ai_training" and not compensation:
            return LiberationCheckResult(
                compliant=False,
                reason="Commercial AI training without creator compensation violates the Liberation License.",
                use_case=use_case,
                recommendations=[
                    "Obtain explicit permission from the creator",
                    "Compensate creators for use in AI training datasets",
                ],
            )

        if entity_type == "corporation" and purpose == "profit" and not compensation:
            return LiberationCheckResult(
                compliant=False,
                reason="Corporate profit extraction without creator compensation violates the Liberation License.",
                use_case=use_case,
                recommendations=[
                    "Negotiate a licensing agreement with the creator",
                    "Include creator compensation in your budget",
                ],
            )

        return LiberationCheckResult(
            compliant=True,
            reason="Use case is compliant with Liberation License terms.",
            use_case=use_case,
        )

    def generate_content_hash(self, content: str) -> str:
        """**Deprecated. This does not match what the server records.**

        It returns ``sha256(raw utf-8)``. The API canonicalises first --
        stripping markup so the same words registered through different tools
        agree -- and hashes that. The two values differ for any content with
        markup, so anything registered against this hash will not be found by a
        lookup of the same work.

        The server is authoritative. Call :meth:`protect` or :meth:`verify` and
        use the ``content_commit`` it returns.
        """
        import warnings
        warnings.warn(
            "generate_content_hash does not match the server's content commitment; "
            "use the content_commit returned by protect() or verify()",
            DeprecationWarning,
            stacklevel=2,
        )
        hex_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
        return f"sha256:{hex_hash}"

    def _validate_content(self, content: str) -> None:
        if not content or not content.strip():
            raise ValidationError("Content cannot be empty")
        if len(content) < 10:
            raise ValidationError("Content must be at least 10 characters")
        if len(content.encode("utf-8")) > 10 * 1024 * 1024:
            raise ValidationError("Content is too large (>10MB)")


def _parse_timestamp(value):
    """Parse an ISO-8601 timestamp string into a datetime, or return None."""
    if value is None:
        return None
    from datetime import datetime, timezone
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
