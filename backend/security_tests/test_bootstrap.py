"""Offline regression tests: no MongoDB connection and no real accounts."""
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from seed import seed_demo_data

class BootstrapTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.users = SimpleNamespace(find_one=AsyncMock(return_value=None), insert_one=AsyncMock())
        self.db = SimpleNamespace(users=self.users)

    async def test_no_configuration_creates_no_account(self):
        with patch.dict(os.environ, {}, clear=True):
            await seed_demo_data(self.db, lambda p: "hashed")
        self.users.insert_one.assert_not_awaited()

    async def test_partial_or_short_configuration_is_rejected(self):
        for config in ({"BOOTSTRAP_OWNER_EMAIL": "owner@example.invalid"},
                       {"BOOTSTRAP_OWNER_PASSWORD": "a" * 24},
                       {"BOOTSTRAP_OWNER_EMAIL": "owner@example.invalid", "BOOTSTRAP_OWNER_PASSWORD": "short"}):
            with self.subTest(config=list(config)), patch.dict(os.environ, config, clear=True):
                with self.assertRaises(RuntimeError):
                    await seed_demo_data(self.db, lambda p: "hashed")
        self.users.insert_one.assert_not_awaited()

    async def test_explicit_bootstrap_hashes_password(self):
        password = "synthetic-only-password-123"
        with patch.dict(os.environ, {"BOOTSTRAP_OWNER_EMAIL": " OWNER@example.invalid ",
                                     "BOOTSTRAP_OWNER_PASSWORD": password}, clear=True):
            await seed_demo_data(self.db, lambda p: "hashed:" + p)
        doc = self.users.insert_one.await_args.args[0]
        self.assertEqual(doc["email"], "owner@example.invalid")
        self.assertEqual(doc["role"], "owner")
        self.assertEqual(doc["password_hash"], "hashed:" + password)
        self.assertNotIn("password", doc)
        self.assertNotIn("is_hidden", doc)

    async def test_existing_owner_is_never_reset(self):
        self.users.find_one.return_value = {"role": "owner"}
        with patch.dict(os.environ, {"BOOTSTRAP_OWNER_EMAIL": "other@example.invalid",
                                     "BOOTSTRAP_OWNER_PASSWORD": "synthetic-only-password-123"}, clear=True):
            await seed_demo_data(self.db, lambda p: "hashed")
        self.users.insert_one.assert_not_awaited()

if __name__ == "__main__":
    unittest.main()
