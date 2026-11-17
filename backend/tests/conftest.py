"""Refuse destructive API integration tests without explicit local isolation.

Use a disposable local backend/database and synthetic users only. Standalone
setup scripts are not protected by pytest hooks and must not be run blindly.
"""
import os
from urllib.parse import urlsplit

import pytest


def pytest_sessionstart(session):
    url = os.environ.get("REACT_APP_BACKEND_URL", "")
    parsed = urlsplit(url)
    if (os.environ.get("CRM_TEST_ISOLATED") != "1"
            or parsed.scheme not in ("http", "https")
            or parsed.hostname not in ("127.0.0.1", "localhost", "::1")
            or parsed.username or parsed.password):
        raise pytest.UsageError(
            "Integration tests mutate records. Set CRM_TEST_ISOLATED=1 and "
            "REACT_APP_BACKEND_URL to a disposable loopback backend with "
            "synthetic fixtures. Remote targets are refused."
        )


@pytest.fixture(autouse=True)
def loopback_requests_only(monkeypatch):
    # Reject per-test hardcoded remote URLs as well as remote redirects.
    import requests
    original = requests.sessions.Session.send

    def send(self, request, **kwargs):
        if urlsplit(request.url).hostname not in ("127.0.0.1", "localhost", "::1"):
            raise RuntimeError("Integration tests cannot contact remote HTTP services")
        return original(self, request, **kwargs)

    monkeypatch.setattr(requests.sessions.Session, "send", send)
