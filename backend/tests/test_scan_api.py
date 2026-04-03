import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import UserRow, app


class ScanApiErrorHandlingTest(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_invalid_scanned_at_returns_400(self) -> None:
        with patch("app.main.should_use_local_mock", return_value=True):
            response = self.client.post(
                "/api/scan",
                json={"user_id": "A12345", "scanned_at": "not-an-iso-datetime"},
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"]["error_code"], "INVALID_SCANNED_AT")

    def test_gas_payload_without_valid_action_returns_502(self) -> None:
        with (
            patch("app.main.should_use_local_mock", return_value=False),
            patch(
                "app.main.get_user_by_id",
                new=AsyncMock(return_value=UserRow(user_id="A12345", display_name="Taro", active=True)),
            ),
            patch(
                "app.main.call_gas_webhook",
                new=AsyncMock(return_value={"ok": False, "message": "gas-side error"}),
            ),
        ):
            response = self.client.post(
                "/api/scan",
                json={"user_id": "A12345"},
            )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"]["error_code"], "GAS_ERROR")
        self.assertEqual(response.json()["detail"]["message"], "GAS応答 action が不正です")

    def test_gas_action_invalid_returns_502(self) -> None:
        with (
            patch("app.main.should_use_local_mock", return_value=False),
            patch(
                "app.main.get_user_by_id",
                new=AsyncMock(return_value=UserRow(user_id="A12345", display_name="Taro", active=True)),
            ),
            patch(
                "app.main.call_gas_webhook",
                new=AsyncMock(return_value={"ok": True, "action": "UNKNOWN_ACTION"}),
            ),
        ):
            response = self.client.post(
                "/api/scan",
                json={"user_id": "A12345"},
            )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"]["error_code"], "GAS_ERROR")
        self.assertEqual(response.json()["detail"]["message"], "GAS応答 action が不正です")


if __name__ == "__main__":
    unittest.main()
