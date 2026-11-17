"""Synthetic auth regressions; no startup, MongoDB access, or HTTP server."""
import os
os.environ.update(MONGO_URL="mongodb://127.0.0.1:27017", DB_NAME="isolated_security_test", JWT_SECRET="synthetic-test-key-never-use-outside-tests")
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from starlette.requests import Request
from starlette.responses import Response
from fastapi import HTTPException
import server

class SessionTests(unittest.IsolatedAsyncioTestCase):
    async def test_cookies_are_secure_httponly_and_samesite(self):
        with patch.object(server, "COOKIE_SECURE", True):
            response = Response()
            server.set_auth_cookies(response, "synthetic-access", "synthetic-refresh")
        cookies = response.headers.getlist("set-cookie")
        self.assertEqual(len(cookies), 2)
        for cookie in cookies:
            self.assertIn("Secure", cookie)
            self.assertIn("HttpOnly", cookie)
            self.assertIn("SameSite=lax", cookie)

    async def test_refresh_rejects_inactive_account(self):
        token = server.make_token("synthetic-user", "owner@example.invalid", "owner", 60, "refresh")
        request = Request({"type": "http", "headers": [(b"cookie", ("refresh_token=" + token).encode())]})
        fake = SimpleNamespace(users=SimpleNamespace(find_one=AsyncMock(return_value={"_id": "synthetic-user", "email": "owner@example.invalid", "role": "owner", "status": "inactive"})))
        with patch.object(server, "db", fake):
            with self.assertRaises(HTTPException) as error:
                await server.refresh(request, Response())
        self.assertEqual(error.exception.status_code, 403)

    async def test_refresh_issues_secure_cookie_for_active_account(self):
        token = server.make_token("synthetic-user", "owner@example.invalid", "owner", 60, "refresh")
        request = Request({"type": "http", "headers": [(b"cookie", ("refresh_token=" + token).encode())]})
        fake = SimpleNamespace(users=SimpleNamespace(find_one=AsyncMock(return_value={"_id": "synthetic-user", "email": "owner@example.invalid", "role": "owner", "status": "active"})))
        response = Response()
        with patch.object(server, "db", fake), patch.object(server, "COOKIE_SECURE", True):
            result = await server.refresh(request, response)
        self.assertTrue(result["ok"])
        self.assertIn("Secure", response.headers["set-cookie"])
