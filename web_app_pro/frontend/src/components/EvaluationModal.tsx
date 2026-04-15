import { useState } from "react";
import { X, CheckCircle, FileSpreadsheet } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { apiClient } from "../lib/api"; // Ensure api client exists or fallback to fetch

interface EvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
}

export default function EvaluationModal({ isOpen, onClose, user }: EvaluationModalProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    expertise: "Clinical",
    q1_trust: 3,
    q2_ux: 3,
    q3_accuracy: 3,
    q4_empathy: 3,
    q5_specialist: 3,
    q6_latency: 3,
    q7_safety: 3,
    feedback: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const userToken = await user?.getIdToken(true);
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/evaluation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify(formData)
      });
      
      if (!res.ok) throw new Error("Failed to submit");
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2000);
    } catch (err) {
      console.error(err);
      alert("Evaluation submission failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCSV = async () => {
    try {
      const userToken = await user?.getIdToken(true);
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/admin/evaluations/csv`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      if (!res.ok) throw new Error("Unauthorized or Failed");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "Phase4_Evaluation_Data.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      alert("Failed to download CSV. Are you an Admin?");
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white dark:bg-black/90 w-full max-w-2xl rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden my-8"
        >
          <div className="p-6 border-b border-black/5 dark:border-white/5 flex items-center justify-between sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md z-10">
            <div>
              <h2 className="text-xl font-bold text-sage-900 dark:text-sage-50">Phase 4 HCI Evaluation</h2>
              <p className="text-xs text-sage-500 uppercase tracking-widest mt-1">Empirical Telemetry Intake</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={handleDownloadCSV}
                className="p-2 bg-blue-500/10 text-blue-600 rounded-lg hover:bg-blue-500 hover:text-white transition-colors"
                title="Admin: Download Global Evaluation CSV"
              >
                <FileSpreadsheet size={20} />
              </button>
              <button onClick={onClose} className="p-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg text-sage-500 transition-colors">
                <X size={20} />
              </button>
            </div>
          </div>

          {success ? (
            <div className="p-16 flex flex-col items-center justify-center gap-4 text-emerald-600">
              <CheckCircle size={64} />
              <p className="text-xl font-bold">Heuristic Analytics Recorded!</p>
              <p className="text-sm opacity-70">WandB Telemetry successfully logged in the backend.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-6">
              
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase text-sage-600 dark:text-sage-400">Your Expertise Domain</label>
                <select 
                  className="p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-transparent focus:border-sage-500 outline-none text-sm dark:text-white"
                  value={formData.expertise}
                  onChange={e => setFormData({...formData, expertise: e.target.value})}
                >
                  <option value="Clinical">Clinical Practitioner</option>
                  <option value="CS/Dev">Computer Science / Developer</option>
                  <option value="Non-Expert">Non-Expert User</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <MetricSlider label="1. Multimodal Trust" val={formData.q1_trust} setVal={(v) => setFormData({...formData, q1_trust: v})} />
                <MetricSlider label="2. UX Intuitiveness" val={formData.q2_ux} setVal={(v) => setFormData({...formData, q2_ux: v})} />
                <MetricSlider label="3. Diagnostic Alignment" val={formData.q3_accuracy} setVal={(v) => setFormData({...formData, q3_accuracy: v})} />
                <MetricSlider label="4. Nurse Empathy" val={formData.q4_empathy} setVal={(v) => setFormData({...formData, q4_empathy: v})} />
                <MetricSlider label="5. Specialist Conformity" val={formData.q5_specialist} setVal={(v) => setFormData({...formData, q5_specialist: v})} />
                <MetricSlider label="6. Latency Tolerance" val={formData.q6_latency} setVal={(v) => setFormData({...formData, q6_latency: v})} />
                <MetricSlider label="7. Fact-Checker Safety" val={formData.q7_safety} setVal={(v) => setFormData({...formData, q7_safety: v})} />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase text-sage-600 dark:text-sage-400">Qualitative Feedback (Focus on RAG Intercepts)</label>
                <textarea 
                  rows={3}
                  className="p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-transparent focus:border-sage-500 outline-none text-sm dark:text-white resize-none"
                  placeholder="Did the rigorous Fact-Checker module visually increase your trust in the system's ability to automate clinical triage?"
                  value={formData.feedback}
                  onChange={e => setFormData({...formData, feedback: e.target.value})}
                />
              </div>

              <div className="flex justify-end pt-4 border-t border-black/5 dark:border-white/5">
                <button 
                  type="submit"
                  disabled={loading}
                  className="bg-sage-600 hover:bg-sage-700 text-white font-bold text-sm px-6 py-3 rounded-xl disabled:opacity-50 transition-all shadow-lg shadow-sage-500/20"
                >
                  {loading ? "Transmitting..." : "Submit Empirical Data"}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function MetricSlider({ label, val, setVal }: { label: string, val: number, setVal: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center text-xs font-bold text-sage-900 dark:text-sage-100">
        <span>{label}</span>
        <span className="w-6 h-6 rounded-full bg-sage-500 text-white flex items-center justify-center">{val}</span>
      </div>
      <input 
        type="range" min="1" max="5" step="1" 
        value={val} 
        onChange={e => setVal(parseInt(e.target.value))}
        className="w-full accent-sage-500"
      />
      <div className="flex justify-between text-[9px] uppercase tracking-widest text-sage-500 font-semibold opacity-70">
        <span>Poor</span>
        <span>Excellent</span>
      </div>
    </div>
  );
}
