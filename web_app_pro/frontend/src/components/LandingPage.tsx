import { motion } from "framer-motion";
import { LogIn } from "lucide-react";
import { loginWithGoogle } from "../lib/firebase";

export default function LandingPage() {
  return (
    <div className="relative min-h-[85vh] px-6 pt-12 pb-16">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-10 items-stretch">
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="apple-glass-panel rounded-3xl p-8 md:p-10 space-y-6"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage-700 dark:text-sage-300">
            Evidence-Oriented Clinical AI
          </p>
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight text-sage-900 dark:text-sage-50 leading-tight">
            Multimodal Diagnosis and
            <br />
            Agentic Triage Workspace
          </h1>
          <p className="text-base md:text-lg text-sage-700 dark:text-sage-300 leading-relaxed max-w-xl">
            MediSim unifies image-text diagnostic inference, traceable triage
            collaboration, and role-governed clinical oversight into one secure
            web platform.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 pt-2">
            <button
              onClick={loginWithGoogle}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-sage-700 text-white text-sm font-semibold rounded-xl hover:bg-sage-800 transition-colors"
            >
              <LogIn size={16} />
              Sign in with Google
            </button>
            <button className="inline-flex items-center justify-center px-6 py-3 apple-glass-panel rounded-xl text-sm font-semibold text-sage-800 dark:text-sage-100">
              View System Methodology
            </button>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="space-y-4"
        >
          <InfoCard
            title="Clinical Safety"
            value="Role-gated workflows"
            detail="Admin, physician, and patient channels with feedback traceability."
          />
          <InfoCard
            title="Model Operations"
            value="Multimodal + Agentic"
            detail="Fusion diagnostics with specialist and fact-check triage orchestration."
          />
          <InfoCard
            title="Data Governance"
            value="EMR-aware context"
            detail="Per-user records, physician notes, and session history for grounded responses."
          />
        </motion.section>
      </div>
    </div>
  );
}

function InfoCard({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="apple-glass-panel rounded-2xl p-6 space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-sage-600 dark:text-sage-400">
        {title}
      </div>
      <div className="text-2xl font-semibold tracking-tight text-sage-900 dark:text-sage-50">
        {value}
      </div>
      <p className="text-sm text-sage-700 dark:text-sage-300 leading-relaxed">
        {detail}
      </p>
    </div>
  );
}
