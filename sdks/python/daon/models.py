"""
Data models for DAON SDK
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Union
from datetime import datetime
from enum import Enum


class EntityType(Enum):
    """Types of entities using DAON-protected content."""
    INDIVIDUAL = "individual"
    CORPORATION = "corporation"
    NONPROFIT = "nonprofit"


class UseType(Enum):
    """Types of content usage."""
    PERSONAL = "personal"
    COMMERCIAL = "commercial"
    AI_TRAINING = "ai_training"
    EDUCATION = "education"
    RESEARCH = "research"


class UsePurpose(Enum):
    """Purpose of content usage."""
    PROFIT = "profit"
    EDUCATION = "education"
    HUMANITARIAN = "humanitarian"
    RESEARCH = "research"


@dataclass
class ContentMetadata:
    """Metadata for content being protected."""
    title: Optional[str] = None
    author: Optional[str] = None
    fandoms: Optional[List[str]] = field(default_factory=list)
    characters: Optional[List[str]] = field(default_factory=list)
    relationships: Optional[List[str]] = field(default_factory=list)
    tags: Optional[List[str]] = field(default_factory=list)
    rating: Optional[str] = None
    warnings: Optional[List[str]] = field(default_factory=list)
    categories: Optional[List[str]] = field(default_factory=list)
    word_count: Optional[int] = None
    chapters: Optional[str] = None
    language: Optional[str] = None
    published_at: Optional[Union[str, datetime]] = None
    updated_at: Optional[Union[str, datetime]] = None
    url: Optional[str] = None
    custom: Optional[Dict[str, Any]] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API calls."""
        data = {}
        for key, value in self.__dict__.items():
            if value is not None:
                if isinstance(value, datetime):
                    data[key] = value.isoformat()
                elif isinstance(value, list) and value:
                    data[key] = value
                elif value:
                    data[key] = value
        return data


@dataclass
class ProtectionRequest:
    """Request to protect content with DAON."""
    content: str
    metadata: Optional[ContentMetadata] = None
    license: Optional[str] = None
    creator_address: Optional[str] = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = ContentMetadata()


@dataclass
class ProtectionResult:
    """Result of content protection operation."""
    success: bool
    content_hash: str
    tx_hash: Optional[str] = None
    verification_url: Optional[str] = None
    blockchain_url: Optional[str] = None
    error: Optional[str] = None
    timestamp: Optional[datetime] = field(default_factory=datetime.now)

    @property
    def protected(self) -> bool:
        """Whether content is successfully protected."""
        return self.success

    @property
    def failed(self) -> bool:
        """Whether protection failed."""
        return not self.success

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "success": self.success,
            "content_hash": self.content_hash,
            "tx_hash": self.tx_hash,
            "verification_url": self.verification_url,
            "blockchain_url": self.blockchain_url,
            "error": self.error,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
        }


@dataclass
class VerificationResult:
    """Result of content verification operation."""
    verified: bool
    content_hash: str
    creator: Optional[str] = None
    license: Optional[str] = None
    timestamp: Optional[datetime] = None
    platform: Optional[str] = None
    verification_url: Optional[str] = None
    blockchain_url: Optional[str] = None
    error: Optional[str] = None

    @property
    def protected(self) -> bool:
        """Whether content is verified as protected."""
        return self.verified

    @property
    def unprotected(self) -> bool:
        """Whether content is not protected."""
        return not self.verified

    @property
    def liberation_licensed(self) -> bool:
        """Whether content uses Liberation License."""
        return bool(self.license and "liberation" in self.license)

    @property
    def creative_commons(self) -> bool:
        """Whether content uses Creative Commons license."""
        return bool(self.license and self.license.startswith("cc_"))

    @property
    def all_rights_reserved(self) -> bool:
        """Whether content is all rights reserved."""
        return self.license == "all_rights_reserved"

    @property
    def protection_date(self) -> Optional[datetime]:
        """When content was protected."""
        return self.timestamp

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "verified": self.verified,
            "content_hash": self.content_hash,
            "creator": self.creator,
            "license": self.license,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "platform": self.platform,
            "verification_url": self.verification_url,
            "blockchain_url": self.blockchain_url,
            "error": self.error,
        }


@dataclass
class LiberationUseCase:
    """Use case for Liberation License compliance checking."""
    entity_type: EntityType
    use_type: UseType
    purpose: UsePurpose
    compensation: bool
    metadata: Optional[Dict[str, str]] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API calls."""
        return {
            "entity_type": self.entity_type.value,
            "use_type": self.use_type.value,
            "purpose": self.purpose.value,
            "compensation": self.compensation,
            "metadata": self.metadata,
        }


@dataclass
class LiberationCheckResult:
    """Result of Liberation License compliance check."""
    compliant: bool
    reason: str
    use_case: LiberationUseCase
    recommendations: Optional[List[str]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "compliant": self.compliant,
            "reason": self.reason,
            "use_case": self.use_case.to_dict(),
            "recommendations": self.recommendations,
        }