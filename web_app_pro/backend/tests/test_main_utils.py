import ast
import json
import os
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class FakeHTTPException(Exception):
    def __init__(self, status_code, detail):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class FakeHTMLResponse:
    def __init__(self, content, headers=None):
        self.content = content
        self.headers = headers or {}


def _load_main_functions(names):
    main_path = Path(__file__).resolve().parents[1] / "main.py"
    source = main_path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(main_path))
    by_name = {
        node.name: node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }

    selected = [by_name[name] for name in names]
    module_ast = ast.Module(body=selected, type_ignores=[])
    compiled = compile(module_ast, filename=str(main_path), mode="exec")

    namespace = {
        "os": os,
        "re": re,
        "json": json,
        "HTTPException": FakeHTTPException,
        "HTMLResponse": FakeHTMLResponse,
    }
    exec(compiled, namespace)
    return namespace


MAIN = _load_main_functions(
    [
        "resolve_static_dir",
        "_get_allowed_origins",
        "normalize_email",
        "get_bootstrap_admin_emails",
        "is_bootstrap_admin_email",
        "_to_clean_list",
        "get_user_role",
        "require_roles",
        "normalize_symptom_tokens",
        "build_diagnostic_findings",
        "build_plain_language_results",
        "confidence_bucket",
        "serve_index_with_env",
    ]
)


class MainUtilityTests(unittest.TestCase):
    def test_normalize_email_lowercases_strips_and_unquotes(self):
        self.assertEqual(MAIN["normalize_email"]("  \"User@Mail.COM\"  "), "user@mail.com")
        self.assertEqual(MAIN["normalize_email"]("' Admin@Site.Org '"), "admin@site.org")

    def test_get_bootstrap_admin_emails_parses_multiple_delimiters(self):
        with patch.dict(os.environ, {"ADMIN_EMAILS": " A@x.com; b@y.com c@z.com "}, clear=True):
            emails = MAIN["get_bootstrap_admin_emails"]()
        self.assertEqual(emails, {"a@x.com", "b@y.com", "c@z.com"})

    def test_is_bootstrap_admin_email_uses_normalized_comparison(self):
        with patch.dict(os.environ, {"ADMIN_EMAIL": "boss@example.com"}, clear=True):
            self.assertTrue(MAIN["is_bootstrap_admin_email"](" BOSS@example.com "))
            self.assertFalse(MAIN["is_bootstrap_admin_email"]("user@example.com"))

    def test_to_clean_list_splits_and_trims(self):
        self.assertEqual(MAIN["_to_clean_list"](" a, b ,, c "), ["a", "b", "c"])
        self.assertEqual(MAIN["_to_clean_list"](""), [])

    def test_get_user_role_prefers_valid_role_then_admin_flag(self):
        self.assertEqual(MAIN["get_user_role"]({"role": " Physician "}), "physician")
        self.assertEqual(MAIN["get_user_role"]({"is_admin": True}), "admin")
        self.assertEqual(MAIN["get_user_role"]({"role": "unknown"}), "patient")

    def test_require_roles_raises_for_disallowed_role(self):
        with self.assertRaises(FakeHTTPException) as exc:
            MAIN["require_roles"]({"role": "patient"}, {"admin"}, "denied")
        self.assertEqual(exc.exception.status_code, 403)
        self.assertEqual(exc.exception.detail, "denied")

    def test_normalize_symptom_tokens_maps_unknowns_and_pads(self):
        vocab = {"cough": 1, "<UNK>": 9, "<PAD>": 0}
        tokens, count, unknown_count, unknown_ratio = MAIN["normalize_symptom_tokens"](
            "cough fever", vocab, max_len=5
        )
        self.assertEqual(tokens, [1, 9, 0, 0, 0])
        self.assertEqual(count, 2)
        self.assertEqual(unknown_count, 1)
        self.assertEqual(unknown_ratio, 0.5)

    def test_normalize_symptom_tokens_truncates(self):
        vocab = {"a": 1, "b": 2, "c": 3, "<UNK>": 9, "<PAD>": 0}
        tokens, *_ = MAIN["normalize_symptom_tokens"]("a b c", vocab, max_len=2)
        self.assertEqual(tokens, [1, 2])

    def test_build_diagnostic_findings_adds_label_and_reliability_signals(self):
        findings = MAIN["build_diagnostic_findings"]("Normal", 0.9, token_count=2, unknown_ratio=0.0)
        self.assertIn("No acute cardiopulmonary disease identified.", findings)
        self.assertIn("Note: Very sparse symptom description provided. Model relied heavily on imaging.", findings)

        warning_findings = MAIN["build_diagnostic_findings"]("Other", 0.5, token_count=10, unknown_ratio=0.8)
        self.assertIn("Primary indication: Other.", warning_findings)
        self.assertTrue(any("Warning: Many symptoms provided" in f for f in warning_findings))

    def test_build_plain_language_results_formats_primary_and_alternatives(self):
        preds = [
            {"label": "Pneumonia", "confidence": 0.55},
            {"label": "Normal", "confidence": 0.30},
        ]
        text = MAIN["build_plain_language_results"](preds, confidence=0.55)
        self.assertIn("**Pneumonia**", text)
        self.assertIn("Other possibilities considered include", text)
        self.assertIn("*Note: The certainty is moderate/low.", text)
        self.assertEqual(MAIN["build_plain_language_results"]([], confidence=0.1), "")

    def test_confidence_bucket_boundaries(self):
        self.assertEqual(MAIN["confidence_bucket"](0.85), "High")
        self.assertEqual(MAIN["confidence_bucket"](0.60), "Moderate")
        self.assertEqual(MAIN["confidence_bucket"](0.59), "Low")

    def test_get_allowed_origins_uses_env_or_defaults(self):
        with patch.dict(os.environ, {"CORS_ALLOWED_ORIGINS": " https://a.com, https://b.com "}, clear=True):
            self.assertEqual(MAIN["_get_allowed_origins"](), ["https://a.com", "https://b.com"])

        with patch.dict(os.environ, {}, clear=True):
            defaults = MAIN["_get_allowed_origins"]()
            self.assertIn("http://localhost:5173", defaults)

    def test_resolve_static_dir_returns_first_existing_index_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            a = Path(tmp) / "a"
            b = Path(tmp) / "b"
            a.mkdir()
            b.mkdir()
            (b / "index.html").write_text("ok", encoding="utf-8")

            MAIN["STATIC_DIR"] = str(a)
            MAIN["STATIC_DIR_CANDIDATES"] = [str(a), str(b)]

            self.assertEqual(MAIN["resolve_static_dir"](), str(b))

    def test_resolve_static_dir_falls_back_to_static_dir(self):
        with tempfile.TemporaryDirectory() as tmp:
            static_dir = Path(tmp) / "fallback"
            static_dir.mkdir()
            MAIN["STATIC_DIR"] = str(static_dir)
            MAIN["STATIC_DIR_CANDIDATES"] = [str(static_dir)]
            self.assertEqual(MAIN["resolve_static_dir"](), str(static_dir))

    def test_serve_index_with_env_injects_runtime_env_script(self):
        with tempfile.TemporaryDirectory() as tmp:
            index_path = Path(tmp) / "index.html"
            index_path.write_text("<html><head></head><body>ok</body></html>", encoding="utf-8")
            env = {
                "VITE_FIREBASE_PROJECT_ID": "pid",
                "VITE_FIREBASE_APP_ID": "aid",
                "VITE_FIREBASE_API_KEY": "key",
                "VITE_FIREBASE_AUTH_DOMAIN": "auth",
                "VITE_FIREBASE_STORAGE_BUCKET": "bucket",
                "VITE_FIREBASE_MESSAGING_SENDER_ID": "sender",
                "VITE_ADMIN_EMAIL": "admin@example.com",
                "VITE_API_BASE_URL": "https://api.example.com",
            }
            with patch.dict(os.environ, env, clear=True):
                resp = MAIN["serve_index_with_env"](str(index_path))

            self.assertIn("window._ENV", resp.content)
            self.assertIn("https://api.example.com", resp.content)
            self.assertEqual(resp.headers["Cache-Control"], "no-store, no-cache, must-revalidate")


if __name__ == "__main__":
    unittest.main()
