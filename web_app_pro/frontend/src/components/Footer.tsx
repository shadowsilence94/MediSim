export default function Footer() {
  return (
    <footer className="mt-24 py-12 border-t border-black/5 dark:border-white/10">
      <div className="max-w-6xl mx-auto px-8 grid md:grid-cols-3 gap-8">
        <div className="space-y-2">
          <div className="text-xl font-semibold text-sage-900 dark:text-sage-50">
            MediSim
          </div>
          <div className="text-sm text-sage-600 dark:text-sage-400 leading-relaxed">
            Professional AI-assisted diagnostic and triage platform powered by
            ResNet18-biLSTM Fusion and Gemini 2.5 Flash Multi-Agent coordination.
          </div>
        </div>

        <div className="space-y-1 text-sm text-sage-600 dark:text-sage-400">
          <div className="font-semibold text-sage-800 dark:text-sage-200">
            Clinical Modules
          </div>
          <div>Diagnostic</div>
          <div>Triage</div>
          <div>Care Ops</div>
        </div>

        <div className="space-y-1 text-sm text-sage-600 dark:text-sage-400">
          <div className="font-semibold text-sage-800 dark:text-sage-200">
            Governance
          </div>
          <div>Audit Trails</div>
          <div>Feedback Monitoring</div>
          <div>Role-based Access Control</div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 mt-8 pt-6 border-t border-black/5 dark:border-white/10 text-xs text-sage-500">
        Copyright 2026 MediSim. All rights reserved.
      </div>
    </footer>
  );
}
