import importlib.util
import os
import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


class _Message:
    def __init__(self, content):
        self.content = content


class _ChatPromptTemplate:
    def __init__(self, messages):
        self._messages = messages

    @classmethod
    def from_messages(cls, messages):
        return cls(messages)

    def format_messages(self):
        return self._messages


class _ChatGoogleGenerativeAI:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class _ChatOpenAI:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


def _load_agents_module():
    fake_google = types.ModuleType("langchain_google_genai")
    fake_google.ChatGoogleGenerativeAI = _ChatGoogleGenerativeAI

    fake_openai = types.ModuleType("langchain_openai")
    fake_openai.ChatOpenAI = _ChatOpenAI

    fake_prompts = types.ModuleType("langchain_core.prompts")
    fake_prompts.ChatPromptTemplate = _ChatPromptTemplate

    fake_messages = types.ModuleType("langchain_core.messages")
    fake_messages.SystemMessage = _Message
    fake_messages.HumanMessage = _Message

    with patch.dict(
        sys.modules,
        {
            "langchain_google_genai": fake_google,
            "langchain_openai": fake_openai,
            "langchain_core.prompts": fake_prompts,
            "langchain_core.messages": fake_messages,
        },
    ):
        backend_dir = Path(__file__).resolve().parents[1]
        module_path = backend_dir / "agents.py"
        spec = importlib.util.spec_from_file_location("medisim_agents_under_test", module_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module


AGENTS = _load_agents_module()


class FakePrompt:
    def __init__(self, payload):
        self._payload = payload

    def format_messages(self):
        return self._payload


class FakeLLM:
    def __init__(self, result_content="ok", stream_chunks=None, stream_raises=False):
        self.result_content = result_content
        self.stream_chunks = stream_chunks or []
        self.stream_raises = stream_raises
        self.invocations = []

    def invoke(self, messages):
        self.invocations.append(messages)
        return SimpleNamespace(content=self.result_content)

    def stream(self, messages):
        if self.stream_raises:
            raise RuntimeError("stream failed")
        for item in self.stream_chunks:
            yield SimpleNamespace(content=item)


class AgentUtilityFunctionTests(unittest.TestCase):
    def test_compact_thread_empty_history(self):
        self.assertEqual(AGENTS._compact_thread([]), "No prior thread messages.")

    def test_compact_thread_maps_roles_and_drops_blank_content(self):
        history = [
            {"role": "user", "content": "I feel dizzy"},
            {"role": "assistant", "content": "Please sit down."},
            {"role": "assistant", "content": "   "},
        ]
        self.assertEqual(
            AGENTS._compact_thread(history),
            "Patient: I feel dizzy\nAssistant: Please sit down.",
        )

    def test_compact_thread_respects_limit(self):
        history = [{"role": "user", "content": f"msg-{i}"} for i in range(5)]
        self.assertEqual(
            AGENTS._compact_thread(history, limit=2),
            "Patient: msg-3\nPatient: msg-4",
        )

    def test_last_assistant_message_returns_latest_non_empty(self):
        history = [
            {"role": "assistant", "content": "First"},
            {"role": "assistant", "content": "  "},
            {"role": "user", "content": "next"},
            {"role": "assistant", "content": "Final"},
        ]
        self.assertEqual(AGENTS._last_assistant_message(history), "Final")

    def test_last_assistant_message_returns_empty_when_missing(self):
        self.assertEqual(AGENTS._last_assistant_message([{"role": "user", "content": "x"}]), "")

    def test_longitudinal_memory_returns_fallback_when_context_empty(self):
        self.assertEqual(AGENTS._longitudinal_memory({}), "No longitudinal memory available.")

    def test_longitudinal_memory_builds_all_sections(self):
        rag = {
            "emr_profile": {
                "age": 41,
                "sex": "female",
                "allergies": ["penicillin"],
                "current_medications": ["ibuprofen"],
            },
            "triage_history": [
                {
                    "intake_summary": "cough for 2 days",
                    "specialist_notes": "likely viral",
                    "final_discharge": "rest and hydration",
                    "created_at": "2026-04-01T10:00:00Z",
                }
            ],
            "diagnosis_history": [
                {"label": "Pneumonia", "confidence": "bad", "symptoms": "cough"}
            ],
            "physician_notes": [{"title": "ER note", "ocr_text": "No acute distress."}],
        }

        text = AGENTS._longitudinal_memory(rag)
        self.assertIn("EMR baseline: age=41 | sex=female", text)
        self.assertIn("Recent triage memory:", text)
        self.assertIn("Recent diagnosis memory:", text)
        self.assertIn("conf=0.00", text)
        self.assertIn("Recent physician notes:", text)

    def test_latest_known_symptom_snapshot_combines_recent_entries(self):
        rag = {
            "triage_history": [
                {"intake_summary": "fever", "specialist_notes": "likely flu", "final_discharge": "fluids"}
            ],
            "diagnosis_history": [
                {"label": "Influenza", "symptoms": "fever, cough"}
            ],
        }
        snapshot = AGENTS._latest_known_symptom_snapshot(rag)
        self.assertIn("fever", snapshot)
        self.assertIn("label=Influenza", snapshot)

    def test_latest_known_symptom_snapshot_fallback(self):
        self.assertEqual(
            AGENTS._latest_known_symptom_snapshot({}),
            "No known prior symptom snapshot.",
        )


class MediSimAgentSystemTests(unittest.TestCase):
    def test_google_provider_requires_api_key(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, "Google API Key"):
                AGENTS.MediSimAgentSystem(provider="google")

    def test_openai_provider_requires_api_key(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, "OpenAI API Key"):
                AGENTS.MediSimAgentSystem(provider="openai")

    def test_google_provider_initializes_llm_with_explicit_key(self):
        agent = AGENTS.MediSimAgentSystem(api_key="abc", provider="google")
        self.assertEqual(agent.api_key, "abc")
        self.assertEqual(agent.llm.kwargs["google_api_key"], "abc")

    def test_run_stage_unknown_stage_raises(self):
        agent = AGENTS.MediSimAgentSystem.__new__(AGENTS.MediSimAgentSystem)
        agent.llm = FakeLLM()
        with self.assertRaisesRegex(ValueError, "Unknown stage"):
            agent.run_stage("bad", "q", {}, {}, stream=False)

    def test_run_stage_non_stream_invokes_llm(self):
        agent = AGENTS.MediSimAgentSystem.__new__(AGENTS.MediSimAgentSystem)
        agent.llm = FakeLLM(result_content="done")
        agent._get_nurse_intake_prompt = lambda *_: FakePrompt(["nurse-msg"])

        result = agent.run_stage("intake", "q", {}, {"intake": []}, stream=False)

        self.assertEqual(result, "done")
        self.assertEqual(agent.llm.invocations[-1], ["nurse-msg"])

    def test_run_stage_stream_uses_stream_generator(self):
        agent = AGENTS.MediSimAgentSystem.__new__(AGENTS.MediSimAgentSystem)
        agent.llm = FakeLLM()
        agent._get_single_agent_prompt = lambda *_: FakePrompt(["single-msg"])
        agent._stream_llm = lambda prompt: iter(["a", "b"])

        chunks = list(agent.run_stage("single_agent", "q", {}, {"single_agent": []}, stream=True))
        self.assertEqual(chunks, ["a", "b"])

    def test_stream_llm_prefers_stream_method(self):
        agent = AGENTS.MediSimAgentSystem.__new__(AGENTS.MediSimAgentSystem)
        agent.llm = FakeLLM(stream_chunks=["one", "two"])

        chunks = list(agent._stream_llm(FakePrompt(["payload"])))
        self.assertEqual(chunks, ["one", "two"])

    def test_stream_llm_falls_back_to_invoke_when_stream_fails(self):
        agent = AGENTS.MediSimAgentSystem.__new__(AGENTS.MediSimAgentSystem)
        agent.llm = FakeLLM(result_content="fallback", stream_raises=True)

        chunks = list(agent._stream_llm(FakePrompt(["payload"])))
        self.assertEqual(chunks, ["fallback"])


if __name__ == "__main__":
    unittest.main()
