import { useState, useRef, useEffect } from "react";
import {
  Send,
  MessageSquare,
  ShieldCheck,
  Activity,
  Loader2,
  KeyRound,
  ArrowRight,
  CheckCircle2,
  RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { apiGet, apiPostForm } from "../lib/api";
import { auth } from "../lib/firebase";

const RAW_API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "").trim();
const API_BASE_URL = RAW_API_BASE_URL
  ? RAW_API_BASE_URL.replace(/\/+$/, "")
  : "";

const formatMessageText = (text: string) => {
  if (!text) return text;
  return text.split("\n").map((line, i) => {
    if (!line) return <br key={`br-${i}`} />;
    const boldParts = line.split(/(\*\*.*?\*\*)/g);
    return (
      <span key={`line-${i}`}>
        {boldParts.map((part, j) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return (
              <strong
                key={`b-${j}`}
                className="font-black text-sage-900 dark:text-sage-50"
              >
                {part.slice(2, -2)}
              </strong>
            );
          }
          const italicParts = part.split(/(\*.*?\*)/g);
          return italicParts.map((ip, k) => {
            if (ip.startsWith("*") && ip.endsWith("*")) {
              return (
                <em key={`i-${j}-${k}`} className="italic">
                  {ip.slice(1, -1)}
                </em>
              );
            }
            return ip;
          });
        })}
        <br />
      </span>
    );
  });
};

interface Message {
  role: "user" | "assistant";
  content: string;
  agent?: string;
  timestamp: Date;
}

interface KeyStatus {
  role: "admin" | "physician" | "patient";
  has_personal_api_key: boolean;
  general_access_allowed: boolean;
  general_key_configured: boolean;
  triage_ready: boolean;
  active_source: "personal" | "general" | "none";
  guidance: string;
}

type TriageStage = "intake" | "specialist" | "final_nurse" | "fact_checker" | "completed";

export default function TriageView() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Welcome to the MediSim Triage System. I am the Intake Nurse. Please describe your symptoms and any recent medical imaging (X-rays) you've had uploaded.",
      agent: "Intake Nurse",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [currentStage, setCurrentStage] = useState<TriageStage>("intake");
  const [agentMode, setAgentMode] = useState<"multi" | "single">("multi");
  const [coordinating, setCoordinating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
  const [latestCaseId, setLatestCaseId] = useState("");
  
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackCondition, setFeedbackCondition] = useState("");
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackMsg, setFeedbackMsg] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const assistantIndexRef = useRef<number | null>(null);

  const STAGE_LABELS: Record<string, string> = {
    intake: "Intake Nurse",
    specialist: "Specialist Doctor",
    final_nurse: "Final Discharge Nurse",
    fact_checker: "Medical Fact Checker",
  };

  const loadKeyStatus = async () => {
    try {
      const data = await apiGet<{ key_status: KeyStatus }>("/settings/key-status");
      setKeyStatus(data.key_status);
    } catch {
      setKeyStatus(null);
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, coordinating, currentStage]);

  useEffect(() => {
    void loadKeyStatus();
  }, []);

  useEffect(() => {
    if (currentStage === "fact_checker" && !coordinating) {
      const timer = setTimeout(() => {
        void handleSend("Execute Final Fact Check Audit");
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentStage]);

  const handleSend = async (overrideMessage?: string) => {
    const textToSend = overrideMessage ?? input;
    if (!textToSend.trim() && !overrideMessage) return;

    if (textToSend.trim()) {
        const userMsg: Message = {
        role: "user",
        content: textToSend,
        timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMsg]);
    }
    
    setInput("");
    setCoordinating(true);
    setErrorMsg("");

    const assistantPlaceholderMsg: Message = {
      role: "assistant",
      content: "",
      agent: agentMode === "single" ? "Standalone Bot" : STAGE_LABELS[currentStage],
      timestamp: new Date(),
    };

    setMessages((prev) => {
      assistantIndexRef.current = prev.length;
      return [...prev, assistantPlaceholderMsg];
    });

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Please sign in first.");
      const token = await user.getIdToken();

      const formData = new FormData();
      formData.append("message", textToSend);
      formData.append("stage", agentMode === "single" ? "single_agent" : currentStage);
      if (latestCaseId) {
        formData.append("case_id", latestCaseId);
      }

      const resp = await fetch(`${API_BASE_URL}/triage`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || `Request failed (${resp.status})`);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No streaming body available from server.");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const lines = part.split(/\r?\n/).map((l) => l.trim());
          const dataLines = lines.filter((l) => l.startsWith("data:"));
          const eventLines = lines.filter((l) => l.startsWith("event:"));
          if (dataLines.length === 0) continue;
          const dataText = dataLines
            .map((l) => l.replace(/^data:\s?/, ""))
            .join("\n");
          try {
            const payload = JSON.parse(dataText);
            if (payload.error) throw new Error(payload.error);
            if (payload.case_id) setLatestCaseId(String(payload.case_id));
            
            const chunk = payload.chunk || "";
            if (chunk) {
                setMessages((prev) => {
                const copy = [...prev];
                const idx = assistantIndexRef.current ?? copy.length - 1;
                if(copy[idx]) {
                    copy[idx] = {
                        ...copy[idx],
                        content: (copy[idx].content || "") + String(chunk),
                    };
                }
                return copy;
                });
            }
          } catch (err) {
            console.error("Failed to parse SSE data", err);
          }
          if (eventLines.some((e) => e.includes("done"))) {
            setCoordinating(false);
          }
        }
      }

      setCoordinating(false);
      
      // Auto advance stage based on 4-step logic if this was a system transition click
      if (overrideMessage) {
         advanceStage();
      }

    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Triage failed.");
      setCoordinating(false);
    }
  };

  const advanceStage = () => {
      switch(currentStage) {
          case "intake": setCurrentStage("specialist"); break;
          case "specialist": setCurrentStage("final_nurse"); break;
          case "final_nurse": setCurrentStage("fact_checker"); break;
          case "fact_checker": setCurrentStage("completed"); break;
      }
  };

  const handleNextPhase = () => {
      let promptText = "";
      if (currentStage === "intake") promptText = "Nurse has completed intake. Transitioning to Specialist Doctor for assessment.";
      else if (currentStage === "specialist") promptText = "Doctor has given advice. Returning to Final Nurse for discharge and medication summary.";
      else if (currentStage === "final_nurse") promptText = "Discharge complete. Requesting final safety audit from Fact Checker.";
      
      handleSend(promptText);
  };

  const submitFeedback = async () => {
    if (!latestCaseId) {
      setFeedbackMsg("Run triage first to submit feedback for this case.");
      return;
    }
    try {
      const formData = new FormData();
      formData.append("source_type", "triage");
      formData.append("source_id", latestCaseId);
      formData.append("rating", String(feedbackRating));
      formData.append("condition", feedbackCondition.trim());
      formData.append("comment", feedbackComment.trim());
      await apiPostForm("/feedback", formData);
      setFeedbackMsg("Feedback submitted. Thank you.");
      setFeedbackComment("");
    } catch (error) {
      setFeedbackMsg(
        error instanceof Error ? error.message : "Failed to submit feedback.",
      );
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-8 py-6 animate-fade-in flex flex-col lg:h-[80vh] min-h-[700px]">
      <div className="flex flex-col lg:flex-row gap-12 h-full">
        <div className="w-full lg:w-3/4 flex flex-col h-full space-y-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sage-500">
                <MessageSquare size={16} />
                <span className="text-[10px] font-bold uppercase tracking-[0.3em]">
                    Module 02
                </span>
                </div>
                
                <div className="flex bg-white/80 dark:bg-black/40 p-1 rounded-full shadow-sm ml-4">
                  <button onClick={() => { setAgentMode("multi"); setCurrentStage("intake"); setMessages([{ role: "assistant", content: "Welcome to the Multi-Agent Triage Pipeline. Please describe your symptoms.", agent: "Intake Nurse", timestamp: new Date() }]); }} className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${agentMode === "multi" ? "bg-sage-600 text-white shadow-md" : "text-sage-500 hover:text-sage-700"}`}>Multi-Agent</button>
                  <button onClick={() => { setAgentMode("single"); setCurrentStage("intake"); setMessages([{ role: "assistant", content: "Welcome to the Single-Agent Baseline Model. How can I help you?", agent: "Standalone Bot", timestamp: new Date() }]); }} className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${agentMode === "single" ? "bg-sage-600 text-white shadow-md" : "text-sage-500 hover:text-sage-700"}`}>Single-Agent</button>
                </div>
                {latestCaseId && (
                    <div className="px-3 py-1 rounded-full border border-sage-500/20 bg-sage-50 text-xs font-mono text-sage-600 dark:text-sage-400">
                        Session Thread ID: {latestCaseId.substring(0,8)}...
                    </div>
                )}
            </div>
            
            <h2 className="text-4xl font-black tracking-tight text-sage-900 dark:text-sage-50 uppercase leading-none italic">
               Triage <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-br from-sage-500 to-sage-700 not-italic font-black">
                Progression
              </span>
            </h2>

            {/* Stepper Wizard UI */}
            <div className="flex items-center justify-between w-full max-w-2xl mt-4 px-4 relative">
                <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-sage-200 dark:bg-sage-800 -z-10 translate-y-[-50%]"></div>
                {agentMode === "multi" && (["intake", "specialist", "final_nurse", "fact_checker", "completed"] as TriageStage[]).map((stage, idx) => {
                    const isActive = currentStage === stage;
                    const isPast = ["intake", "specialist", "final_nurse", "fact_checker", "completed"].indexOf(currentStage) > idx;
                    return (
                        <button key={stage} onClick={() => setCurrentStage(stage)} disabled={coordinating} className="flex flex-col items-center gap-2 cursor-pointer hover:scale-110 hover:opacity-80 transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors duration-500 shadow-sm ${
                                isActive ? "bg-sage-600 text-white ring-4 ring-sage-600/20" : 
                                isPast ? "bg-emerald-500 text-white" : "bg-white dark:bg-sage-900 text-sage-400 border-2 border-sage-200 dark:border-sage-800"
                            }`}>
                                {isPast ? <CheckCircle2 size={16} /> : idx + 1}
                            </div>
                            <span className={`text-[10px] uppercase tracking-wider font-bold transition-colors ${isActive ? "text-sage-800 dark:text-sage-200" : "text-sage-400"}`}>
                                {stage.replace('_', ' ')}
                            </span>
                        </button>
                    );
                })}
            </div>
          </div>

          <div className="flex-grow flex flex-col bg-white/40 dark:bg-white/5 backdrop-blur-xl border border-black/5 dark:border-white/5 rounded-[2.5rem] overflow-hidden shadow-sm relative">
            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-sage-500/5 to-transparent pointer-events-none"></div>

            <div
              ref={scrollRef}
              className="flex-grow overflow-y-auto p-10 space-y-10 custom-scrollbar scroll-smooth"
            >
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
                >
                  <div
                    className={`max-w-[85%] p-8 rounded-[2rem] space-y-3 relative overflow-hidden transition-all duration-500 ${
                      m.role === "user"
                        ? "bg-sage-900 text-white rounded-tr-none shadow-xl"
                        : "bg-white/60 dark:bg-white/5 border border-black/5 dark:border-white/5 text-sage-900 dark:text-sage-100 rounded-tl-none"
                    }`}
                  >
                    {m.agent && (
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2 h-2 rounded-full animate-pulse ${
                            m.agent.includes("Nurse") ? "bg-blue-500" : 
                            m.agent.includes("Doctor") ? "bg-purple-500" : "bg-emerald-500"
                        }`}></div>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">
                          {m.agent}
                        </span>
                      </div>
                    )}
                    <p className="text-base font-light leading-relaxed whitespace-pre-wrap">
                      {formatMessageText(m.content)}
                    </p>
                    <div
                      className={`text-[8px] font-bold uppercase tracking-widest opacity-30 mt-2 ${m.role === "user" ? "text-right" : "text-left"}`}
                    >
                      {m.timestamp.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              ))}
              {coordinating && (
                <div className="flex justify-start animate-fade-in">
                  <div className="flex items-center gap-4 p-6 bg-sage-500/5 rounded-[2rem] border border-sage-500/10 text-sage-500 backdrop-blur-md">
                    <div className="relative">
                      <Loader2 size={16} className="animate-spin" />
                      <div className="absolute inset-0 bg-sage-500 blur-md opacity-20"></div>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest italic">
                      Agent `{agentMode === "single" ? "Standalone Bot" : STAGE_LABELS[currentStage]}` Processing...
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-8 bg-white/40 dark:bg-black/40 border-t border-black/5 dark:border-white/5 backdrop-blur-2xl">
              <div className="flex flex-col gap-4 relative">
                
                {/* Stage progression controls */}
                <div className="flex justify-center mb-2">
                   <AnimatePresence mode="popLayout">
                       {!coordinating && currentStage !== "completed" && agentMode === "multi" && (
                           <motion.button
                                initial={{opacity:0, y:20}}
                                animate={{opacity:1, y:0}}
                                exit={{opacity:0, scale:0.9}}
                                onClick={handleNextPhase}
                                className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-sage-600 to-sage-800 text-white rounded-full text-[11px] font-black uppercase tracking-wider shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all"
                           >
                               Proceed to {currentStage === "intake" ? "Doctor Consultation" : currentStage === "specialist" ? "Discharge Notes" : "Fact Check Audit"}
                               <ArrowRight size={14} />
                           </motion.button>
                       )}
                       <motion.button
                            initial={{opacity:0}} animate={{opacity:1}}
                            onClick={() => {
                                sessionStorage.removeItem('triage_messages');
                                sessionStorage.removeItem('triage_stage');
                                sessionStorage.removeItem('triage_case_id');
                                setMessages([{ role: "assistant", timestamp: new Date(), content: "Hello, I am the Intake Nurse. Could you please describe your symptoms and how long you've been experiencing them?" }]);
                                setCurrentStage("intake");
                                setLatestCaseId("");
                            }}
                            className={`${coordinating ? 'hidden' : 'flex'} items-center gap-2 px-6 py-2 ml-4 bg-white/50 dark:bg-black/40 text-sage-600 dark:text-sage-400 border border-sage-200 dark:border-sage-800 rounded-full text-[11px] font-black uppercase tracking-wider hover:bg-sage-50 dark:hover:bg-sage-900/50 transition-all`}
                       >
                           <RefreshCw size={14} /> Restart Session
                       </motion.button>
                   </AnimatePresence>
                </div>

                <div className="flex gap-4">
                    <input
                    type="text"
                    disabled={currentStage === "fact_checker" || currentStage === "completed"}
                    className="flex-grow p-5 bg-white/50 dark:bg-black/20 border border-black/5 dark:border-white/10 rounded-2xl focus:ring-2 focus:ring-sage-500/20 focus:border-sage-500 outline-none transition-all text-sm font-light italic text-sage-900 dark:text-sage-100 placeholder:text-sage-500/50 disabled:opacity-50"
                    placeholder={
                        agentMode === "single" ? "Chat with Standalone Baseline..." :
                        currentStage === "completed" ? "Session completed." :
                        currentStage === "fact_checker" ? "Fact Check is final." :
                        `Chat with ${STAGE_LABELS[currentStage]}...`
                    }
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                        e.preventDefault();
                        void handleSend();
                        }
                    }}
                    />
                    <button
                    onClick={() => {
                        void handleSend();
                    }}
                    disabled={coordinating || !input.trim() || currentStage === "fact_checker" || currentStage === "completed"}
                    className="w-16 h-16 bg-sage-900 dark:bg-sage-600 text-white rounded-2xl shadow-xl hover:-translate-y-1 transition-all active:scale-95 disabled:opacity-20 flex items-center justify-center shrink-0"
                    >
                    <Send size={20} />
                    </button>
                </div>

                {errorMsg && (
                    <div className="text-xs font-semibold text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                    {errorMsg}
                    </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="w-full lg:w-1/4 flex flex-col space-y-8 h-full overflow-y-auto custom-scrollbar pb-8 pr-2">
          
          <div className="p-8 bg-white/40 dark:bg-white/5 backdrop-blur-xl border border-black/5 dark:border-white/5 rounded-[2rem] space-y-4">
             <div className="flex items-center gap-2 text-sage-700 dark:text-sage-300">
               <KeyRound size={14} />
               <h5 className="text-[10px] font-black uppercase tracking-[0.3em] border-b border-black/10 dark:border-white/10 pb-2 flex-grow">
                 System Status
               </h5>
             </div>
             <div className="space-y-3 pt-2">
                 <div className="flex justify-between items-center text-xs">
                     <span className="opacity-60 font-bold uppercase tracking-wider text-[9px]">Readiness</span>
                     <span className={`px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${keyStatus?.triage_ready ? "bg-emerald-500/10 text-emerald-700" : "bg-red-500/10 text-red-700"}`}>
                        {keyStatus?.triage_ready ? "Online" : "Offline"}
                     </span>
                 </div>
                 <div className="flex justify-between items-center text-xs">
                     <span className="opacity-60 font-bold uppercase tracking-wider text-[9px]">Model Target</span>
                     <span className="text-[10px] font-mono opacity-80 backdrop-blur-md bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-md">gemini-2.5-flash</span>
                 </div>
                 <div className="flex justify-between items-center text-xs">
                     <span className="opacity-60 font-bold uppercase tracking-wider text-[9px]">API Source</span>
                     <span className="text-[10px] font-bold text-sage-600">{keyStatus?.active_source || '---'}</span>
                 </div>
             </div>
          </div>
          
          <div className="p-10 bg-sage-900 dark:bg-sage-800 rounded-[2.5rem] text-white space-y-10 shadow-2xl relative overflow-hidden flex-shrink-0">
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-sage-500/20 blur-[60px] rounded-full"></div>

            <div className="space-y-6 relative z-10">
              <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-sage-400 border-b border-white/5 pb-2">
                Active Cluster
              </h5>
              {agentMode === "multi" ? (
              <div className="space-y-4">
                <AgentNode name="Intake Nurse" status={currentStage === 'intake' ? 'Active' : currentStage !== 'completed' ? 'Wait' : 'Done'} isActive={currentStage === 'intake'} />
                <AgentNode name="Specialist" status={currentStage === 'specialist' ? 'Active' : currentStage !== 'completed' && currentStage !== 'intake' ? 'Wait' : 'Done'} isActive={currentStage === 'specialist'} />
                <AgentNode name="Pharmacist" status={currentStage === 'final_nurse' ? 'Active' : currentStage === 'fact_checker' || currentStage === 'completed' ? 'Done' : 'Wait'} isActive={currentStage === 'final_nurse'} />
                <AgentNode
                  name="Safety Core"
                  status={currentStage === 'fact_checker' ? 'Active' : currentStage === 'completed' ? 'Done' : 'Wait'}
                  icon={<ShieldCheck size={12} />}
                  isActive={currentStage === 'fact_checker'}
                />
              </div>
              ) : (
                <div className="space-y-4">
                  <AgentNode name="Standalone Triage Baseline" status="Active" isActive={true} />
                </div>
              )}
            </div>
          </div>

          <div className="p-6 bg-white/40 dark:bg-white/5 backdrop-blur-xl border border-black/5 dark:border-white/5 rounded-[2rem] space-y-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-sage-500">
              Triage Feedback Rating
            </div>
            <select
              value={feedbackRating}
              onChange={(e) => setFeedbackRating(Number(e.target.value))}
              className="w-full p-2 rounded-xl bg-white/70 dark:bg-black/20 border border-black/10 dark:border-white/10 text-sm"
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>{`${n} Stars`}</option>
              ))}
            </select>
            <input
              value={feedbackCondition}
              onChange={(e) => setFeedbackCondition(e.target.value)}
              placeholder="Primary Impression"
              className="w-full p-2 rounded-xl bg-white/70 dark:bg-black/20 border border-black/10 dark:border-white/10 text-sm"
            />
             <textarea
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              rows={2}
              placeholder="Clinical Notes"
              className="w-full p-2 rounded-xl bg-white/70 dark:bg-black/20 border border-black/10 dark:border-white/10 text-sm text-black"
            />
            <button
              onClick={submitFeedback}
              className="w-full px-4 py-3 rounded-xl bg-sage-700 text-white text-xs font-bold uppercase tracking-wider shadow-md hover:-translate-y-0.5 transition-all"
            >
              Submit Feedback
            </button>
            {feedbackMsg && (
              <div className="text-[11px] text-sage-700 dark:text-sage-300 font-bold text-center">
                {feedbackMsg}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentNode({ name, status, isActive, icon }: any) {
  return (
    <div className={`flex justify-between items-center group transition-all p-2 -mx-2 rounded-xl ${isActive ? 'bg-white/10' : ''}`}>
      <span className={`text-[11px] flex items-center gap-2 transition-opacity ${isActive ? 'font-bold opacity-100 text-white' : 'font-light opacity-60'}`}>
        {icon || <Activity size={12} />} {name}
      </span>
      <span className={`text-[8px] font-black uppercase tracking-tighter px-2.5 py-1 rounded-full border transition-colors ${
          isActive ? 'bg-sage-500 text-white border-sage-400' : 'bg-white/5 text-sage-400 border-white/5'
      }`}>
        {status}
      </span>
    </div>
  );
}
