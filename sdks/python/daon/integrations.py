"""
Framework integration mixins for Django and Flask.
"""

from .client import DAONClient
from .models import ContentMetadata, ProtectionRequest


class DjangoMixin:
    """
    Mixin that adds DAON content protection to a Django model.

    Usage::

        from daon.integrations import DjangoMixin
        from django.db import models

        class Article(DjangoMixin, models.Model):
            title = models.CharField(max_length=255)
            body = models.TextField()
            daon_hash = models.CharField(max_length=80, blank=True)

            daon_content_field = "body"

    Call ``instance.daon_protect()`` to register the content and store
    the resulting hash in ``daon_hash``.
    """

    #: Name of the model field that holds the content to protect.
    daon_content_field: str = "content"
    #: License to register under. Defaults to liberation_v1.
    daon_default_license: str = "liberation_v1"
    #: Name of the model field where the DAON hash should be saved.
    daon_hash_field: str = "daon_hash"

    def daon_protect(self, api_url: str = None, save: bool = True):
        """
        Register this object's content with DAON and store the hash.

        Parameters
        ----------
        api_url:
            Override the API URL (useful for testing).
        save:
            If True (default), call ``self.save(update_fields=[daon_hash_field])``
            after a successful registration.

        Returns
        -------
        ProtectionResult
        """
        content = getattr(self, self.daon_content_field, "")
        client = DAONClient(api_url=api_url) if api_url else DAONClient()

        metadata = ContentMetadata(
            title=getattr(self, "title", None),
            author=str(getattr(self, "author", None) or ""),
        )
        request = ProtectionRequest(
            content=content,
            metadata=metadata,
            license=self.daon_default_license,
        )
        result = client.protect(request)

        if result.success and hasattr(self, self.daon_hash_field):
            setattr(self, self.daon_hash_field, result.content_hash)
            if save:
                self.save(update_fields=[self.daon_hash_field])

        return result

    def daon_verify(self, api_url: str = None):
        """
        Verify the stored DAON hash for this object.

        Returns
        -------
        VerificationResult
        """
        content_hash = getattr(self, self.daon_hash_field, None)
        if not content_hash:
            content_hash = getattr(self, self.daon_content_field, "")

        client = DAONClient(api_url=api_url) if api_url else DAONClient()
        return client.verify(content_hash)


class FlaskMixin:
    """
    Helper that integrates DAON protection into a Flask application.

    Usage::

        from flask import Flask
        from daon.integrations import FlaskMixin

        app = Flask(__name__)
        daon = FlaskMixin(app)

        # or use the factory pattern:
        daon = FlaskMixin()
        daon.init_app(app)

    The mixin reads ``DAON_API_URL`` from ``app.config`` if set.
    """

    def __init__(self, app=None, api_url: str = None):
        self._api_url = api_url
        self._client = None
        if app is not None:
            self.init_app(app)

    def init_app(self, app):
        """Bind this helper to a Flask application instance."""
        url = self._api_url or app.config.get("DAON_API_URL", DAONClient.DEFAULT_API_URL)
        self._client = DAONClient(api_url=url)

    @property
    def client(self) -> DAONClient:
        if self._client is None:
            self._client = DAONClient(api_url=self._api_url) if self._api_url else DAONClient()
        return self._client

    def protect(self, content: str, metadata: ContentMetadata = None, license: str = None):
        """Protect content and return a ProtectionResult."""
        request = ProtectionRequest(
            content=content,
            metadata=metadata or ContentMetadata(),
            license=license,
        )
        return self.client.protect(request)

    def verify(self, content_or_hash: str):
        """Verify content or a hash and return a VerificationResult."""
        return self.client.verify(content_or_hash)
