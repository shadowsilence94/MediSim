from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import SystemMessage, HumanMessage
import os

def _compact_thread(history, limit: int = 20) -> str:
    if not history:
        return "No prior thread messages."

    recent = history[-limit:]
    lines = []
    for item in recent:
        role = str(item.get("role", "assistant")).strip().lower()
        role_label = "Patient" if role == "user" else "Assistant"
        content = str(item.get("content", "")).strip()
        if content:
            lines.append(f"{role_label}: {content}")

    return "\n".join(lines) if lines else "No prior thread messages."

def _last_assistant_message(history) -> str:
    if not history:
        return ""
    for item in reversed(history):
        if str(item.get("role", "")).lower() == "assistant":
            content = str(item.get("content", "")).strip()
            if content:
                return content
    return ""

def _longitudinal_memory(rag_context: dict, max_triage: int = 8, max_diag: int = 6, max_notes: int = 4) -> str:
    """Build a compact but high-signal memory block from RAG history."""
    rag_context = rag_context or {}
    emr = rag_context.get("emr_profile", {}) or {}
    triage_history = rag_context.get("triage_history", []) or []
    diagnosis_history = rag_context.get("diagnosis_history", []) or []
    physician_notes = rag_context.get("physician_notes", []) or []

    lines = []

    # Persistent patient baseline
    baseline = []
    age = emr.get("age")
    sex = emr.get("sex")
    allergies = emr.get("allergies") or []
    meds = emr.get("current_medications") or []
    if age:
        baseline.append(f"age={age}")
    if sex:
        baseline.append(f"sex={sex}")
    if allergies:
        baseline.append(f"allergies={', '.join(map(str, allergies[:6]))}")
    if meds:
        baseline.append(f"current_meds={', '.join(map(str, meds[:6]))}")
    if baseline:
        lines.append("EMR baseline: " + " | ".join(baseline))

    # Prior triage outcomes
    if triage_history:
        lines.append("Recent triage memory:")
        for item in triage_history[:max_triage]:
            intake = str(item.get("intake_summary", "")).strip()
            specialist = str(item.get("specialist_notes", "")).strip()
            discharge = str(item.get("final_discharge", "")).strip()
            
            parts = []
            if intake:
                parts.append(f"Intake: {intake[:150]}")
            if specialist:
                parts.append(f"Doc Plan: {specialist[:150]}")
            if discharge:
                parts.append(f"Discharge: {discharge[:150]}")
            
            signal = " | ".join(parts)
            
            if signal:
                lines.append(f"- [{item.get('created_at', '')[:10]}] {signal}")

    # Prior model/diagnosis pattern
    if diagnosis_history:
        lines.append("Recent diagnosis memory:")
        for item in diagnosis_history[:max_diag]:
            label = str(item.get("label", "")).strip()
            conf = item.get("confidence", 0.0)
            try:
                conf_text = f"{float(conf):.2f}"
            except Exception:
                conf_text = "0.00"
            symptoms = str(item.get("symptoms", "")).strip()
            bit = f"label={label}, conf={conf_text}"
            if symptoms:
                bit += f", symptoms={symptoms[:120]}"
            lines.append(f"- {bit}")

    # Physician free-text notes
    if physician_notes:
        lines.append("Recent physician notes:")
        for item in physician_notes[:max_notes]:
            title = str(item.get("title", "")).strip() or "note"
            text = str(item.get("ocr_text", "")).strip()
            if text:
                lines.append(f"- {title}: {text[:220]}")

    if not lines:
        return "No longitudinal memory available."
    return "\n".join(lines)


def _latest_known_symptom_snapshot(rag_context: dict) -> str:
    """Extract a short deterministic symptom/context snapshot for intake grounding."""
    rag_context = rag_context or {}
    triage_history = rag_context.get("triage_history", []) or []
    diagnosis_history = rag_context.get("diagnosis_history", []) or []

    snapshots = []

    for item in triage_history[:2]:
        intake = str(item.get("intake_summary", "")).strip()
        specialist = str(item.get("specialist_notes", "")).strip()
        discharge = str(item.get("final_discharge", "")).strip()
        text = " | ".join(part for part in [intake, specialist, discharge] if part)
        if text:
            snapshots.append(text[:220])

    for item in diagnosis_history[:2]:
        label = str(item.get("label", "")).strip()
        symptoms = str(item.get("symptoms", "")).strip()
        bit = ""
        if label:
            bit += f"label={label}"
        if symptoms:
            bit += (", " if bit else "") + f"symptoms={symptoms[:120]}"
        if bit:
            snapshots.append(bit)

    if not snapshots:
        return "No known prior symptom snapshot."
    return " || ".join(snapshots[:3])

class MediSimAgentSystem:
    def __init__(self, api_key=None, provider="google"):
        """
        Initializes the Agent system.
        provider: "google" or "openai"
        """
        self.provider = provider
        if provider == "google":
            self.api_key = api_key or os.getenv("GOOGLE_API_KEY")
            if not self.api_key:
                raise ValueError("Google API Key is required for the Agentic Triage feature.")
            self.llm = ChatGoogleGenerativeAI(google_api_key=self.api_key, model="gemini-2.5-flash")
        else:
            self.api_key = api_key or os.getenv("OPENAI_API_KEY")
            if not self.api_key:
                raise ValueError("OpenAI API Key is required for the Agentic Triage feature.")
            self.llm = ChatOpenAI(api_key=self.api_key, model="gpt-4o")

    def _get_nurse_intake_prompt(self, user_query, rag_context, thread_history=None):
        display_name = rag_context.get("emr_profile", {}).get("display_name", "Patient")
        history_str = _compact_thread(thread_history or [])
        memory_block = _longitudinal_memory(rag_context)
        known_snapshot = _latest_known_symptom_snapshot(rag_context)

        return ChatPromptTemplate.from_messages([
            SystemMessage(content=(
                f"You are a real-world Intake Triage Nurse speaking with {display_name}. "
                "CRITICAL INSTRUCTION: Keep your response extremely concise, under 3 short sentences. "
                "Do intake only: gather symptoms. Ask at most one focused follow-up question IF necessary. "
                "If you have enough information about their condition, DO NOT ask more questions. Instead, provide a brief triage assessment and explicitly advise the patient to click 'Proceed to Doctor Consultation' for expert advice. "
                "Do not provide final diagnosis. "
                "You HAVE full access to their prior Diagnostic Results, EMR, and prior triage memory. "
                "If the user says things like 'same as last session', 'don't you remember', or asks about previous findings, you MUST reference the supplied memory and restate what is known before asking any follow-up. "
                "NEVER claim you do not have records if Longitudinal Memory contains prior entries. "
                "Use longitudinal memory to avoid re-asking already known facts. "
                "Maintain continuity with the intake thread history."
            )),
            HumanMessage(content=(
                f"Context: {rag_context}\n\n"
                f"Latest Known Symptom Snapshot:\n{known_snapshot}\n\n"
                f"Longitudinal Memory:\n{memory_block}\n\n"
                f"Intake Nurse Thread History:\n{history_str}\n\n"
                f"User message: {user_query}"
            )),
        ])

    def _get_specialist_prompt(self, user_query, nurse_report, rag_context, thread_history=None):
        display_name = rag_context.get("emr_profile", {}).get("display_name", "Patient")
        history_str = _compact_thread(thread_history or [])
        memory_block = _longitudinal_memory(rag_context)

        return ChatPromptTemplate.from_messages([
            SystemMessage(content=(
                f"You are a specialist doctor consulting on {display_name}'s case. "
                "CRITICAL INSTRUCTION: Keep your response concise, under 4 short sentences, like a brief verbal clinic conversation. "
                "Give a likely assessment, proper explanation of the condition, proper suggestion for care, and one immediate action. "
                "If the user asks a follow up question, answer it directly. "
                "If you have given your advice securely, tell the patient you have concluded your consultation and explicitly instruct them to click 'Proceed to Discharge Notes' for final medication suggestions. DO NOT ask them if they have more questions. "
                "Incorporate relevant longitudinal history and avoid repeating settled facts. "
                "No bullet points. Avoid unsupported claims; say uncertainty explicitly."
            )),
            HumanMessage(content=(
                f"Context: {rag_context}\n\n"
                f"Longitudinal Memory:\n{memory_block}\n\n"
                f"Specialist Thread History:\n{history_str}\n\n"
                f"Nurse handoff note: {nurse_report}\n\n"
                f"Latest user message: {user_query}"
            )),
        ])

    def _get_final_nurse_prompt(self, nurse_report, specialist_advice, rag_context):
        display_name = rag_context.get("emr_profile", {}).get("display_name", "Patient")
        memory_block = _longitudinal_memory(rag_context)
        return ChatPromptTemplate.from_messages([
            SystemMessage(content=(
                f"You are the Final Discharge Triage Nurse wrapping up the session for {display_name}. "
                "CRITICAL INSTRUCTION: Based on the Intake note and the Doctor's advice, provide a concise final summary. "
                "Provide clear medication/care suggestions respecting the patient's EMR allergies and current medications. "
                "Keep it under 4 sentences. Explain the doctor's plan in plain language and give clear advice on what to do next. DO NOT ask questions back. Instruct the patient that the session is concluded and they can click 'Proceed to Fact Check Audit'. "
                "If there is interaction/allergy uncertainty, explicitly say to confirm with a licensed clinician."
            )),
            HumanMessage(content=(
                f"Longitudinal Memory / EMR: {memory_block}\n\n"
                f"Intake Nurse Report: {nurse_report}\n\n"
                f"Specialist Advice: {specialist_advice}\n\n"
                "Provide the final summary and medication/care instructions."
            )),
        ])

    def _get_fact_checker_prompt(self, nurse_report, specialist_advice, final_nurse_note, rag_context):
        memory_block = _longitudinal_memory(rag_context)
        return ChatPromptTemplate.from_messages([
            SystemMessage(content=(
                "You are a Medical Fact-Check Auditor. "
                "CRITICAL INSTRUCTION: Keep your response under 3 short sentences. "
                "Review the intake, specialist advice, and final nurse discharge note. "
                "State what is supported, what is uncertain/hallucinated, and the safest next action."
            )),
            HumanMessage(content=(
                f"Longitudinal Memory & EMR:\n{memory_block}\n\n"
                f"Intake Report: {nurse_report}\n\n"
                f"Specialist Advice: {specialist_advice}\n\n"
                f"Final Nurse Discharge Note: {final_nurse_note}\n\n"
                "Provide final safety verification."
            )),
        ])

    def _stream_llm(self, prompt: ChatPromptTemplate):
        """Yield text chunks from the underlying LLM stream."""
        formatted = prompt.format_messages()
        stream_method = getattr(self.llm, "stream", None)
        if callable(stream_method):
            try:
                for chunk in stream_method(formatted):
                    text = getattr(chunk, "content", None)
                    if isinstance(text, str) and text:
                        yield text
                return
            except Exception:
                pass
        
        result = self.llm.invoke(formatted)
        content = getattr(result, "content", None) or str(result)
        if content:
            yield content

    def _get_single_agent_prompt(self, user_query, rag_context, thread_history=None):
        display_name = rag_context.get("emr_profile", {}).get("display_name", "Patient")
        history_str = _compact_thread(thread_history or [])
        memory_block = _longitudinal_memory(rag_context)
        return ChatPromptTemplate.from_messages([
            SystemMessage(content=(
                f"You are a standalone general AI Medical Chatbot talking to {display_name}. "
                "Answer the user's medical questions and suggest treatments directly based on their symptoms. "
                "Try to be helpful and provide comprehensive diagnostic thoughts in one message."
            )),
            HumanMessage(content=(
                f"Memory: {memory_block}\n\n"
                f"History:\n{history_str}\n\n"
                f"User message: {user_query}"
            )),
        ])

    def run_stage(self, stage: str, user_query: str, rag_context: dict, thread_memory: dict, stream: bool = False):
        """
        Runs a specific stage of the 4-step process.
        Stages: 'intake', 'specialist', 'final_nurse', 'fact_checker', 'single_agent'
        """
        if stage == 'intake':
            prompt = self._get_nurse_intake_prompt(user_query, rag_context, thread_memory.get('intake', []))
        elif stage == 'specialist':
            nurse_report = _last_assistant_message(thread_memory.get('intake', []))
            prompt = self._get_specialist_prompt(user_query, nurse_report, rag_context, thread_memory.get('specialist', []))
        elif stage == 'final_nurse':
            nurse_report = _last_assistant_message(thread_memory.get('intake', []))
            specialist_advice = _last_assistant_message(thread_memory.get('specialist', []))
            prompt = self._get_final_nurse_prompt(nurse_report, specialist_advice, rag_context)
        elif stage == 'fact_checker':
            nurse_report = _last_assistant_message(thread_memory.get('intake', []))
            specialist_advice = _last_assistant_message(thread_memory.get('specialist', []))
            final_nurse_note = _last_assistant_message(thread_memory.get('final_nurse', []))
            prompt = self._get_fact_checker_prompt(nurse_report, specialist_advice, final_nurse_note, rag_context)
        elif stage == 'single_agent':
            prompt = self._get_single_agent_prompt(user_query, rag_context, thread_memory.get('single_agent', []))
        else:
            raise ValueError(f"Unknown stage: {stage}")

        if not stream:
            result = self.llm.invoke(prompt.format_messages())
            return result.content

        def _stream():
            for chunk in self._stream_llm(prompt):
                yield chunk
        return _stream()
