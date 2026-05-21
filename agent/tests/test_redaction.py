"""Tests for items #9 + #10 — recursive redaction in audit_logger and the
logger's sensitive-field filter.

These verify that secret-bearing fields don't end up:
  - written verbatim to the audit_events table (#9)
  - written verbatim to stdout or per-contract log files (#10)
"""
from __future__ import annotations

import logging

import pytest

from agent.db.audit_logger import SENSITIVE_KEYS, _redact
from agent.utils.logging import _SensitiveFieldFilter, _SENSITIVE_KEYS


class TestAuditRecursiveRedact:
    def test_top_level_account_id_is_redacted(self):
        payload = {"account_id": "act_1234567890", "ok": True}
        out = _redact(payload)
        assert out["account_id"].startswith("act_1234")
        assert out["account_id"].endswith("***")
        assert out["ok"] is True

    def test_nested_account_id_is_redacted(self):
        # This is the exact shape that previously slipped through:
        # inputs.account_context.account_id was raw `act_XXXXX` in the DB.
        payload = {
            "inputs": {
                "contract_terms": {"requested_target_roas": 2.0},
                "account_context": {
                    "account_id": "act_1234567890",
                    "pixel_id": "987654321",
                    "historical_roas_30d": 2.1,
                },
            },
            "model_version": "1.0.0",
        }
        out = _redact(payload)
        assert out["inputs"]["account_context"]["account_id"].endswith("***")
        assert out["inputs"]["account_context"]["pixel_id"].endswith("***")
        # Non-sensitive fields untouched
        assert out["inputs"]["account_context"]["historical_roas_30d"] == 2.1
        assert out["inputs"]["contract_terms"]["requested_target_roas"] == 2.0
        assert out["model_version"] == "1.0.0"

    def test_list_of_dicts_is_walked(self):
        payload = {
            "events": [
                {"name": "open", "access_token": "sk-ant-secret"},
                {"name": "close"},
            ]
        }
        out = _redact(payload)
        assert out["events"][0]["access_token"].endswith("***")
        assert out["events"][1] == {"name": "close"}

    def test_case_insensitive_key_matching(self):
        # SENSITIVE_KEYS is lowercase but JSON payloads in the wild use
        # mixed-case identifiers (e.g. backend serializes Authorization)
        payload = {"Authorization": "Bearer abc", "ok": True}
        out = _redact(payload)
        assert out["Authorization"].endswith("***")

    def test_non_string_secret_returns_placeholder(self):
        # If for any reason a sensitive key holds a non-string value, we still
        # mask rather than leak.
        payload = {"access_token": {"nested": "leaked"}}
        out = _redact(payload)
        assert out["access_token"] == "***"

    def test_known_sensitive_keys_present(self):
        # Sanity check — make sure the canonical secrets are listed
        for key in ("access_token", "private_key", "entity_secret", "anthropic_api_key"):
            assert key in SENSITIVE_KEYS


class TestLoggerSensitiveFilter:
    def _record(self, **extras) -> logging.LogRecord:
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="x.py",
            lineno=1, msg="m", args=(), exc_info=None,
        )
        for k, v in extras.items():
            setattr(record, k, v)
        return record

    def test_access_token_field_is_masked(self):
        flt = _SensitiveFieldFilter()
        rec = self._record(access_token="sk-ant-1234567890abcdef", contract_id="abc")
        flt.filter(rec)
        assert rec.access_token.startswith("sk-a")
        assert rec.access_token.endswith("***")
        # Non-sensitive field unchanged
        assert rec.contract_id == "abc"

    def test_x_service_token_field_is_masked(self):
        flt = _SensitiveFieldFilter()
        rec = self._record(x_service_token="my-token-abc")
        flt.filter(rec)
        assert rec.x_service_token.endswith("***")

    def test_authorization_field_case_insensitive(self):
        flt = _SensitiveFieldFilter()
        rec = self._record(Authorization="Bearer x")
        flt.filter(rec)
        assert rec.Authorization == "***" or rec.Authorization.endswith("***")

    def test_short_value_uses_pure_mask(self):
        flt = _SensitiveFieldFilter()
        rec = self._record(access_token="abc")
        flt.filter(rec)
        assert rec.access_token == "***"

    def test_non_sensitive_keys_pass_through(self):
        flt = _SensitiveFieldFilter()
        rec = self._record(contract_id="abc-123", probability=0.7, message="hello")
        flt.filter(rec)
        assert rec.contract_id == "abc-123"
        assert rec.probability == 0.7
        assert rec.message == "hello"

    def test_known_sensitive_keys_present(self):
        for key in ("access_token", "x_service_token", "anthropic_api_key"):
            assert key in _SENSITIVE_KEYS
