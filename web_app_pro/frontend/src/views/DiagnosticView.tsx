import React, { useState, useEffect } from "react";
import { FileUp, Zap, Loader2, Thermometer, Brain, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { apiPostForm } from "../lib/api";

interface AnalysisResult {
  label: string;
  confidence: number;
  details: string;
  plainTextResults: string[];
  recommendation: string;
  timestamp?: string;
}

interface DiagnoseResponse {
  status: string;
  prediction: {
    label: string;
    confidence: number;
    details: string;
    plain_text_results?: string[];
    token_stats?: {
      total_tokens: number;
      unknown_tokens: number;
      unknown_ratio: number;
    };
  };
  user: string;
  record_id?: string;
}

export default function DiagnosticView() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [report, setReport] = useState(() => sessionStorage.getItem('diag_report') || "");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(() => {
      const saved = sessionStorage.getItem('diag_result');
      if (saved) {
          try { return JSON.parse(saved); } catch(e) {}
      }
      return null;
  });
  const [errorMsg, setErrorMsg] = useState("");
  const [recordId, setRecordId] = useState(() => sessionStorage.getItem('diag_record_id') || "");

  useEffect(() => { sessionStorage.setItem('diag_report', report); }, [report]);
  useEffect(() => { sessionStorage.setItem('diag_result', JSON.stringify(result)); }, [result]);
  useEffect(() => { sessionStorage.setItem('diag_record_id', recordId); }, [recordId]);
  const [rating, setRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackMsg, setFeedbackMsg] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setResult(null);
    }
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
  };

  const handleAnalyze = async () => {
    if (!file && !report) return;
    if (!file) {
      setErrorMsg("Please upload a chest X-ray image.");
      return;
    }
    setAnalyzing(true);
    setResult(null);
    setErrorMsg("");

    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append(
        "symptoms",
        report || "No additional symptom text provided.",
      );

      const response = await apiPostForm<DiagnoseResponse>(
        "/diagnose",
        formData,
      );
      setRecordId(response.record_id || "");

      setResult({
        label: response.prediction.label,
        confidence: response.prediction.confidence,
        details: response.prediction.details,
        plainTextResults: (() => {
            const ptr = response.prediction.plain_text_results;
            if (Array.isArray(ptr) && ptr.length > 0) return ptr;
            if (typeof ptr === 'string') return (ptr as string).split('\n').filter(Boolean);
            if (response.prediction.details && Array.isArray(response.prediction.details)) return response.prediction.details;
            return [
                `Most likely finding: ${response.prediction.label}.`,
                "Please review this result with a clinician for final confirmation.",
            ];
        })(),
        recommendation:
          response.prediction.confidence >= 0.7
            ? "Recommended next step: discuss this result with your doctor and correlate with your current symptoms."
            : "Recommended next step: arrange physician review and consider additional imaging/tests.",
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Diagnosis failed.";
      setErrorMsg(message);
    } finally {
      setAnalyzing(false);
    }
  };

  const submitDiagnosticFeedback = async () => {
    if (!recordId || !result) {
      setFeedbackMsg("Run diagnosis first to submit feedback.");
      return;
    }
    try {
      const formData = new FormData();
      formData.append("source_type", "diagnostic");
      formData.append("source_id", recordId);
      formData.append("rating", String(rating));
      formData.append("condition", result.label);
      formData.append("comment", feedbackComment.trim());
      await apiPostForm("/feedback", formData);
      setFeedbackMsg("Feedback submitted.");
      setFeedbackComment("");
    } catch (error) {
      setFeedbackMsg(
        error instanceof Error ? error.message : "Failed to submit feedback.",
      );
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-8 py-12 animate-fade-in">
      <div className="flex flex-col lg:flex-row justify-between items-start gap-12">
        <div className="w-full lg:w-2/3 space-y-10">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sage-500">
              <Thermometer size={16} />
              <span className="text-[10px] font-bold uppercase tracking-[0.3em]">
                Module 01
              </span>
            </div>
            <h2 className="text-5xl font-black tracking-tight text-sage-900 dark:text-sage-50 uppercase leading-none">
              Diagnostic <br />
              <span className="text-sage-500 font-light italic normal-case tracking-tighter">
                Fusion Hub
              </span>
            </h2>
            <p className="text-sage-600 dark:text-sage-400 font-light italic leading-relaxed max-w-lg">
              Initialize multimodal analysis of clinical scans and patient
              narratives to extract precision signals via orchestrated neural
              networks.
            </p>
          </div>

          <div className="space-y-8">
            <div className="p-10 bg-white/40 dark:bg-white/5 backdrop-blur-xl border border-black/5 dark:border-white/5 rounded-[2.5rem] shadow-sm space-y-8">
              <div className="space-y-4">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-sage-500">
                    Multimodal Input : Imaging
                  </label>
                  {file && (
                    <button
                      onClick={() => {
                          clearFile();
                          setReport("");
                          setResult(null);
                          setRecordId("");
                          sessionStorage.removeItem('diag_report');
                          sessionStorage.removeItem('diag_result');
                          sessionStorage.removeItem('diag_record_id');
                      }}
                      className="text-[9px] font-bold uppercase text-red-500 hover:opacity-100 opacity-60 transition-opacity flex items-center gap-1"
                    >
                      <RefreshCw size={10} /> Reset Session
                    </button>
                  )}
                </div>

                <div
                  className={`relative border-2 border-dashed rounded-[2rem] transition-all duration-500 h-80 flex items-center justify-center overflow-hidden group ${
                    file
                      ? "border-sage-500 bg-sage-500/5"
                      : "border-black/5 dark:border-white/10 hover:border-sage-500/30"
                  }`}
                >
                  {!preview ? (
                    <label className="cursor-pointer flex flex-col items-center gap-6 p-12 w-full h-full justify-center">
                      <input
                        type="file"
                        className="hidden"
                        onChange={handleFileChange}
                        accept="image/*"
                      />
                      <div className="p-5 bg-sage-500/5 rounded-2xl text-sage-500 group-hover:scale-110 transition-transform shadow-sm">
                        <FileUp size={32} />
                      </div>
                      <div className="space-y-2 text-center text-sage-900 dark:text-sage-50">
                        <p className="font-bold uppercase tracking-tighter">
                          Inject Clinical Scan
                        </p>
                        <p className="text-[10px] text-sage-500 font-bold uppercase tracking-widest opacity-60">
                          JPEG / PNG Supported
                        </p>
                      </div>
                    </label>
                  ) : (
                    <div className="w-full h-full relative group">
                      <img
                        src={preview}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000"
                        alt="preview"
                      />
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <p className="text-white text-[10px] font-black uppercase tracking-[0.3em]">
                          Scan Archive Integrated
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-bold uppercase tracking-widest text-sage-500 ml-1">
                  Textual Signal : Narrative
                </label>
                <textarea
                  className="w-full h-48 p-8 bg-white/50 dark:bg-black/20 border border-black/5 dark:border-white/10 rounded-3xl focus:ring-2 focus:ring-sage-500/20 focus:border-sage-500 outline-none transition-all text-sm font-light italic placeholder:text-sage-500/30 text-sage-900 dark:text-sage-100"
                  placeholder="Incorporate medical history, clinical symptoms, or preliminary report findings..."
                  value={report}
                  onChange={(e) => setReport(e.target.value)}
                />
              </div>

              <button
                onClick={handleAnalyze}
                disabled={analyzing || (!file && !report)}
                className="w-full flex items-center justify-center gap-3 py-6 bg-sage-900 dark:bg-sage-600 text-white rounded-2xl font-black uppercase tracking-[0.3em] shadow-xl hover:-translate-y-1 hover:shadow-sage-500/20 active:scale-[0.98] transition-all disabled:opacity-20 disabled:pointer-events-none"
              >
                {analyzing ? (
                  <Loader2 className="animate-spin" size={24} />
                ) : (
                  <Zap size={24} fill="currentColor" />
                )}
                {analyzing
                  ? "Synthesizing Signal..."
                  : "Execute Fusion Analysis"}
              </button>

              {errorMsg && (
                <div className="text-xs font-semibold text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  {errorMsg}
                </div>
              )}

              <div className="p-6 bg-sage-500/5 border border-sage-500/20 rounded-2xl space-y-3">
                <h5 className="text-[10px] font-black uppercase tracking-widest text-sage-600 dark:text-sage-400">
                  Experiment Methodology
                </h5>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-sage-500 opacity-60">
                      Independent Variable (IV)
                    </div>
                    <div className="text-xs font-light italic text-sage-900 dark:text-sage-50">
                      Multimodal Fusion Arch (Image + Text)
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-sage-500 opacity-60">
                      Dependent Variable (DV)
                    </div>
                    <div className="text-xs font-light italic text-sage-900 dark:text-sage-50">
                      Diagnostic Classification Precision (~71.4%)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full lg:w-1/3 space-y-8 lg:sticky lg:top-28">
          <div className="p-10 bg-sage-900 dark:bg-sage-800 rounded-[2.5rem] text-white space-y-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-sage-500/10 blur-[60px] rounded-full -mr-16 -mt-16"></div>

            <AnimatePresence mode="wait">
              {result ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8 relative z-10"
                >
                  <div className="p-6 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-sage-300">
                      Predicted Result
                    </div>
                    <div className="text-lg font-black text-sage-100">
                      {result.label}
                    </div>
                    <div className="text-xs text-sage-300">
                      Model confidence: {(result.confidence * 100).toFixed(1)}%
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-sage-400">
                      Result Summary
                    </h5>
                    <ul className="space-y-3">
                      {result.plainTextResults.map((f, i) => (
                        <li
                          key={i}
                          className="flex gap-3 text-sm font-light italic opacity-80 border-b border-white/5 pb-2"
                        >
                          <span className="text-sage-400 font-black">
                            0{i + 1}
                          </span>{" "}
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-6 bg-sage-500/20 rounded-2xl border border-sage-400/20">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-sage-400 mb-2">
                      Next Step
                    </h5>
                    <p className="text-sm font-bold uppercase tracking-tight leading-snug">
                      {result.recommendation}
                    </p>
                  </div>

                  <div className="p-6 bg-white/10 rounded-2xl border border-white/10 space-y-3">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-sage-300">
                      Feedback Rating
                    </h5>
                    <select
                      value={rating}
                      onChange={(e) => setRating(Number(e.target.value))}
                      className="w-full p-2 rounded-xl bg-white/20 border border-white/10 text-white"
                    >
                      {[5, 4, 3, 2, 1].map((n) => (
                        <option key={n} value={n}>{`${n} / 5`}</option>
                      ))}
                    </select>
                    <textarea
                      value={feedbackComment}
                      onChange={(e) => setFeedbackComment(e.target.value)}
                      rows={2}
                      placeholder="How accurate was this result?"
                      className="w-full p-2 rounded-xl bg-white/20 border border-white/10 text-white placeholder:text-white/60"
                    />
                    <button
                      onClick={submitDiagnosticFeedback}
                      className="w-full px-3 py-2 rounded-xl bg-sage-600 text-white text-xs font-bold uppercase tracking-wider"
                    >
                      Submit Feedback
                    </button>
                    {feedbackMsg && (
                      <div className="text-[11px] text-sage-200">
                        {feedbackMsg}
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : (
                <div className="py-20 text-center space-y-6 opacity-30 relative z-10">
                  <Brain size={64} className="mx-auto animate-pulse" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] max-w-[150px] mx-auto italic">
                    Awaiting Multimodal Input Signals
                  </p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
