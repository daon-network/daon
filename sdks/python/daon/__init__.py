"""
DAON Creator Protection SDK for Python

Provides easy integration with DAON blockchain for content protection.
Perfect for Django, Flask, FastAPI, and other Python applications.
"""

from .client import DAONClient, DAONError, NetworkError, ValidationError, ProtectionError
from .models import (
    ContentMetadata,
    ProtectionRequest,
    ProtectionResult,
    VerificationResult,
    LiberationUseCase,
    LiberationCheckResult,
)
from .utils import generate_content_hash, normalize_content
from .integrations import DjangoMixin, FlaskMixin

# Version info
__version__ = "1.0.0"
__author__ = "DAON Network"
__email__ = "dev@daon.network"

# Default configuration
DEFAULT_CONFIG = {
    "api_url": "https://api.daon.network",
    "chain_id": "daon-mainnet-1",
    "timeout": 30,
    "retries": 3,
    "default_license": "liberation_v1",
}

# Global client instance for convenience functions
_default_client = None


def configure(**kwargs):
    """Configure the default DAON client with custom settings."""
    global _default_client
    _default_client = DAONClient(**kwargs)
    return _default_client


def get_client():
    """Get the default DAON client, creating it if necessary."""
    global _default_client
    if _default_client is None:
        _default_client = DAONClient()
    return _default_client


# Convenience functions using the default client
def protect(content: str, metadata=None, license=None, creator_address=None):
    """Protect content using the default DAON client."""
    client = get_client()
    request = ProtectionRequest(
        content=content,
        metadata=metadata or {},
        license=license,
        creator_address=creator_address,
    )
    return client.protect(request)


def verify(content_or_hash: str):
    """Verify content protection using the default DAON client."""
    client = get_client()
    return client.verify(content_or_hash)


def check_liberation_compliance(content_hash: str, use_case: LiberationUseCase):
    """Check Liberation License compliance using the default DAON client."""
    client = get_client()
    return client.check_liberation_compliance(content_hash, use_case)


# Make key classes available at package level
__all__ = [
    "DAONClient",
    "DAONError",
    "NetworkError", 
    "ValidationError",
    "ProtectionError",
    "ContentMetadata",
    "ProtectionRequest",
    "ProtectionResult",
    "VerificationResult",
    "LiberationUseCase",
    "LiberationCheckResult",
    "DjangoMixin",
    "FlaskMixin",
    "generate_content_hash",
    "normalize_content",
    "configure",
    "get_client",
    "protect",
    "verify",
    "check_liberation_compliance",
]