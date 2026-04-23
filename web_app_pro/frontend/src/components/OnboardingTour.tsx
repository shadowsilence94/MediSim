import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";

interface TourStep {
  title: string;
  description: string;
  icon: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    icon: "🏥",
    title: "Welcome to MediSim!",
    description:
      "MediSim is a clinical AI platform combining Multimodal Diagnostics and Multi-Agent Triage. This quick tour will show you the key features. Let's get started!",
  },
  {
    icon: "🩻",
    title: "Diagnostic Assistant",
    description:
      "Click 'Diagnostic' in the top navigation to upload a Chest X-Ray alongside your symptoms. Our ResNet + Bio_ClinicalBERT fusion model will analyze them together and return a confidence-weighted diagnosis.",
  },
  {
    icon: "🤖",
    title: "Agentic Triage",
    description:
      "The 'Triage' feature routes your inputs through three specialized AI agents — a Triage Nurse, a Specialist Doctor, and a Fact-Checker — to produce safe, verified clinical guidance.",
  },
  {
    icon: "📋",
    title: "History & Records",
    description:
      "All your past diagnostic sessions are saved under 'History'. You can review previous results, confidence scores, and agent conversation logs at any time.",
  },
  {
    icon: "💬",
    title: "Physician Chat",
    description:
      "The circular chat button in the bottom-right corner opens a secure messaging thread with physicians or admins who can review your case and provide direct guidance.",
  },
  {
    icon: "📊",
    title: "Evaluate the System",
    description:
      "After testing the platform, please click the orange 'Evaluate' button in the navbar to submit your Phase 4 HCI feedback. Your input directly improves the system!",
  },
];

export default function OnboardingTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const seen = localStorage.getItem("medisim_tour_done");
    if (!seen) {
      // Small delay so the dashboard renders first
      const t = setTimeout(() => setVisible(true), 1000);
      return () => clearTimeout(t);
    }
  }, []);

  const handleClose = () => {
    setVisible(false);
    localStorage.setItem("medisim_tour_done", "true");
  };

  const handleNext = () => {
    if (step < TOUR_STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      handleClose();
    }
  };

  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const current = TOUR_STEPS[step];

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9995]"
            onClick={handleClose}
          />

          {/* Tour card */}
          <motion.div
            key={`step-${step}`}
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="fixed z-[9999] inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="pointer-events-auto w-[480px] max-w-[calc(100vw-2rem)] bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
              {/* Header bar */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-black/5 dark:border-white/5">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-sage-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-sage-500">
                    Getting Started — Step {step + 1} of {TOUR_STEPS.length}
                  </span>
                </div>
                <button
                  onClick={handleClose}
                  className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-sage-500"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Content */}
              <div className="px-8 py-7 space-y-4">
                <div className="text-5xl">{current.icon}</div>
                <h2 className="text-xl font-bold text-sage-900 dark:text-sage-50 leading-snug">
                  {current.title}
                </h2>
                <p className="text-sm text-sage-600 dark:text-sage-400 leading-relaxed">
                  {current.description}
                </p>
              </div>

              {/* Progress dots */}
              <div className="flex justify-center gap-2 pb-2">
                {TOUR_STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === step
                        ? "w-6 bg-sage-500"
                        : "w-1.5 bg-black/15 dark:bg-white/20"
                    }`}
                  />
                ))}
              </div>

              {/* Footer actions */}
              <div className="flex items-center justify-between px-8 py-5 border-t border-black/5 dark:border-white/5">
                <button
                  onClick={handleBack}
                  disabled={step === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider text-sage-600 dark:text-sage-400 hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-30"
                >
                  <ChevronLeft size={14} />
                  Back
                </button>
                <button
                  onClick={handleClose}
                  className="text-[11px] text-sage-400 hover:text-sage-600 transition-colors uppercase tracking-wider font-semibold"
                >
                  Skip tour
                </button>
                <button
                  onClick={handleNext}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-sage-500 text-white text-[11px] font-black uppercase tracking-wider hover:bg-sage-600 transition-colors shadow-md shadow-sage-500/20"
                >
                  {step === TOUR_STEPS.length - 1 ? "Finish" : "Next"}
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
