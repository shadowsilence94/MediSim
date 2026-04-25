import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Thermometer,
  MessageSquare,
  Zap,
  ShieldCheck,
  Database,
  Cpu,
  BarChart3,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";

type Page = "home" | "diagnostic" | "triage" | "history" | "settings";

interface DashboardProps {
  setCurrentPage: (page: Page) => void;
}

interface ModelInsights {
  baseline?: {
    summary?: {
      accuracy?: number;
      precision?: number;
      recall?: number;
      f1?: number;
      samples?: number;
    };
    class_support?: number[];
    confidence_histogram?: { bin_edges?: number[]; counts?: number[] };
  };
  multimodal_fusion?: {
    summary?: {
      accuracy?: number;
      precision?: number;
      recall?: number;
      f1?: number;
      evaluated_samples?: number;
    };
    epoch_loss?: number[];
    epoch_accuracy?: number[];
    class_support?: number[];
  };
}

const fallbackInsights: ModelInsights = {
  baseline: {
    summary: {
      accuracy: 0.4604,
      precision: 0.4310,
      recall: 0.4604,
      f1: 0.4352,
      samples: 280,
    },
    class_support: [37, 13, 180, 46, 4],
    confidence_histogram: {
      bin_edges: [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
      counts: [0, 0, 1, 2, 17, 12, 22, 18, 36, 172],
    },
  },
  multimodal_fusion: {
    summary: {
      accuracy: 0.5108,
      precision: 0.4485,
      recall: 0.5108,
      f1: 0.4682,
      evaluated_samples: 280,
    },
    epoch_loss: [0.9135, 0.5951, 0.3770, 0.1824, 0.1273],
    epoch_accuracy: [0.6864, 0.7802, 0.8678, 0.9462, 0.9554],
    class_support: [37, 13, 180, 46, 4],
  },
};

export default function Dashboard({ setCurrentPage }: DashboardProps) {
  const [insights, setInsights] = useState<ModelInsights>(fallbackInsights);

  useEffect(() => {
    const safeFetchJson = async (url: string) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;

        const contentType = res.headers.get("content-type") || "";
        if (!contentType.toLowerCase().includes("application/json")) {
          return null;
        }

        return await res.json();
      } catch {
        return null;
      }
    };

    const loadInsights = async () => {
      try {
        const [baselineData, fusionData, mergedData] = await Promise.all([
          safeFetchJson("/baseline_insights.json"),
          safeFetchJson("/fusion_insights.json"),
          safeFetchJson("/model_insights.json"),
        ]);

        const next: ModelInsights = { ...fallbackInsights };

        if (baselineData) {
          next.baseline = baselineData?.baseline || baselineData;
        }
        if (fusionData) {
          next.multimodal_fusion = fusionData?.multimodal_fusion || fusionData;
        }
        if (mergedData) {
          next.baseline = mergedData?.baseline || next.baseline;
          next.multimodal_fusion =
            mergedData?.multimodal_fusion || next.multimodal_fusion;
        }

        setInsights(next);
      } catch (error) {
        console.error("Could not load model insights:", error);
      }
    };
    loadInsights();
  }, []);

  const baselineAccuracy = (insights.baseline?.summary?.accuracy ?? 0) * 100;
  const fusionAccuracy =
    (insights.multimodal_fusion?.summary?.accuracy ?? 0) * 100;
  const baselineF1 = (insights.baseline?.summary?.f1 ?? 0) * 100;
  const fusionF1 = (insights.multimodal_fusion?.summary?.f1 ?? 0) * 100;
  const baselinePrecision = (insights.baseline?.summary?.precision ?? 0) * 100;
  const fusionPrecision =
    (insights.multimodal_fusion?.summary?.precision ?? 0) * 100;
  const baselineRecall = (insights.baseline?.summary?.recall ?? 0) * 100;
  const fusionRecall = (insights.multimodal_fusion?.summary?.recall ?? 0) * 100;

  const accuracyBars = useMemo(
    () => [
      {
        name: "Baseline",
        accuracy: Number(baselineAccuracy.toFixed(2)),
        color: "#9fb59f",
      },
      {
        name: "Fusion",
        accuracy: Number(fusionAccuracy.toFixed(2)),
        color: "#557c55",
      },
    ],
    [baselineAccuracy, fusionAccuracy],
  );

  const trainingCurve = useMemo(() => {
    const loss = insights.multimodal_fusion?.epoch_loss ?? [];
    const acc = insights.multimodal_fusion?.epoch_accuracy ?? [];
    const len = Math.max(loss.length, acc.length);
    return Array.from({ length: len }, (_, i) => ({
      epoch: i + 1,
      loss: loss[i] ?? null,
      accuracy:
        acc[i] != null ? Number(((acc[i] as number) * 100).toFixed(2)) : null,
    }));
  }, [insights]);

  const confidenceCurve = useMemo(() => {
    const histogram = insights.baseline?.confidence_histogram;
    const edges = histogram?.bin_edges ?? [];
    const counts = histogram?.counts ?? [];
    return counts.map((count, i) => ({
      bucket:
        edges[i] != null && edges[i + 1] != null
          ? `${edges[i].toFixed(1)}-${edges[i + 1].toFixed(1)}`
          : `${i}`,
      count,
    }));
  }, [insights]);

  const supportBars = useMemo(() => {
    const baseline = insights.baseline?.class_support ?? [];
    const fusion = insights.multimodal_fusion?.class_support ?? [];
    const len = Math.max(baseline.length, fusion.length);
    return Array.from({ length: len }, (_, i) => ({
      className: `C${i + 1}`,
      baseline: baseline[i] ?? 0,
      fusion: fusion[i] ?? 0,
    }));
  }, [insights]);

  return (
    <div className="max-w-6xl mx-auto px-6 md:px-8 py-10 md:py-12 space-y-12">
      <div className="relative rounded-[2rem] border border-black/5 dark:border-white/10 p-8 md:p-10 overflow-hidden bg-gradient-to-br from-[#f3f8f3] via-white to-[#e9f2e9] dark:from-[#101710] dark:via-[#131b13] dark:to-[#182418]">
        <div className="absolute -top-20 -right-16 h-56 w-56 rounded-full bg-sage-500/15 blur-3xl" />
        <div className="absolute -bottom-24 -left-12 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />

        <div className="relative flex flex-col lg:flex-row gap-8 lg:items-end lg:justify-between">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-sage-500 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-sage-500 opacity-80">
                Model Insights Live
              </span>
            </div>
            <h2 className="text-4xl md:text-6xl font-black tracking-tight text-sage-900 dark:text-sage-50 uppercase leading-[0.9]">
              MediSim
              <br />
              <span className="text-sage-500 font-light italic normal-case tracking-tight">
                Performance Studio
              </span>
            </h2>
            <p className="text-base md:text-lg text-sage-700 dark:text-sage-300 font-light italic max-w-2xl leading-relaxed">
              Your dashboard now reads notebook-exported metrics from model
              training and evaluation, so this view matches your project
              workflow.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full lg:w-auto">
            <DashMetric
              icon={<Database size={14} />}
              label="Baseline Acc"
              value={`${baselineAccuracy.toFixed(2)}%`}
            />
            <DashMetric
              icon={<BarChart3 size={14} />}
              label="Baseline F1"
              value={`${baselineF1.toFixed(2)}%`}
            />
            <DashMetric
              icon={<BarChart3 size={14} />}
              label="Baseline P/R"
              value={`${baselinePrecision.toFixed(1)} / ${baselineRecall.toFixed(1)}`}
            />
            <DashMetric
              icon={<Cpu size={14} />}
              label="Fusion Acc"
              value={`${fusionAccuracy.toFixed(2)}%`}
            />
            <DashMetric
              icon={<ShieldCheck size={14} />}
              label="Fusion F1"
              value={`${fusionF1.toFixed(2)}%`}
            />
            <DashMetric
              icon={<BarChart3 size={14} />}
              label="Fusion P/R"
              value={`${fusionPrecision.toFixed(1)} / ${fusionRecall.toFixed(1)}`}
            />
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <ModuleItem
          icon={<Thermometer className="text-sage-500" size={30} />}
          title="Diagnostic Fusion"
          description="Run multimodal clinical inference using image and narrative symptoms."
          onClick={() => setCurrentPage("diagnostic")}
          badge="Model"
        />
        <ModuleItem
          icon={<MessageSquare className="text-sage-500" size={30} />}
          title="Agentic Triage"
          description="Collect recommendations from the deliberation agents for triage decisions."
          onClick={() => setCurrentPage("triage")}
          badge="Agents"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <InsightCard
          title="Accuracy Comparison"
          subtitle="Baseline CNN vs Multimodal Fusion"
          footer={`Lift: ${(fusionAccuracy - baselineAccuracy).toFixed(2)}%`}
        >
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={220}
          >
            <BarChart
              data={accuracyBars}
              margin={{ top: 12, right: 8, left: 0, bottom: 8 }}
            >
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                fontSize={11}
              />
              <YAxis
                domain={[0, 100]}
                axisLine={false}
                tickLine={false}
                fontSize={11}
              />
              <Tooltip formatter={(value) => `${value}%`} />
              <Bar dataKey="accuracy" radius={[10, 10, 0, 0]}>
                {accuracyBars.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </InsightCard>

        <InsightCard
          title="Training Dynamics"
          subtitle="Fusion loss and accuracy per epoch"
          footer="From 03_multimodal_fusion_training.ipynb"
        >
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={220}
          >
            <LineChart
              data={trainingCurve}
              margin={{ top: 12, right: 16, left: 4, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.15} />
              <XAxis
                dataKey="epoch"
                axisLine={false}
                tickLine={false}
                fontSize={11}
              />
              <YAxis
                yAxisId="left"
                axisLine={false}
                tickLine={false}
                fontSize={11}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                axisLine={false}
                tickLine={false}
                fontSize={11}
              />
              <Tooltip />
              <Legend iconType="circle" />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="loss"
                stroke="#557c55"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                name="Loss"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="accuracy"
                stroke="#94a68f"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                name="Accuracy (%)"
              />
            </LineChart>
          </ResponsiveContainer>
        </InsightCard>

        <InsightCard
          title="Baseline Confidence Histogram"
          subtitle="Prediction confidence distribution"
          footer="From 02_baseline_training.ipynb"
        >
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={220}
          >
            <AreaChart
              data={confidenceCurve}
              margin={{ top: 12, right: 16, left: 0, bottom: 8 }}
            >
              <defs>
                <linearGradient id="confidenceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#557c55" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#557c55" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.12} />
              <XAxis
                dataKey="bucket"
                axisLine={false}
                tickLine={false}
                fontSize={10}
              />
              <YAxis axisLine={false} tickLine={false} fontSize={11} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#557c55"
                strokeWidth={2.5}
                fill="url(#confidenceFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </InsightCard>

        <InsightCard
          title="Class Support Snapshot"
          subtitle="Observed label counts used in evaluation"
          footer="C1..Cn represent encoded class order"
        >
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={220}
          >
            <BarChart
              data={supportBars}
              margin={{ top: 12, right: 8, left: 0, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.12} />
              <XAxis
                dataKey="className"
                axisLine={false}
                tickLine={false}
                fontSize={11}
              />
              <YAxis axisLine={false} tickLine={false} fontSize={11} />
              <Tooltip />
              <Legend iconType="circle" />
              <Bar
                dataKey="baseline"
                fill="#b5c8b0"
                radius={[6, 6, 0, 0]}
                name="Baseline"
              />
              <Bar
                dataKey="fusion"
                fill="#557c55"
                radius={[6, 6, 0, 0]}
                name="Fusion"
              />
            </BarChart>
          </ResponsiveContainer>
        </InsightCard>
      </div>

      <div className="p-8 md:p-10 apple-glass-panel rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-white dark:bg-black/30 shadow-xl rounded-2xl text-sage-500 animate-float">
            <ShieldCheck size={30} />
          </div>
          <div className="space-y-1 text-center md:text-left">
            <h4 className="text-lg md:text-xl font-bold tracking-tight text-sage-900 dark:text-sage-50 uppercase italic">
              Research-to-Demo Pipeline Active
            </h4>
            <p className="text-sage-600 dark:text-sage-400 text-sm font-light uppercase tracking-widest opacity-70">
              Notebook training metrics are connected to app visualization
              assets
            </p>
          </div>
        </div>
        <button
          onClick={() => setCurrentPage("history")}
          className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest text-sage-900 dark:text-sage-50 hover:bg-sage-500 hover:text-white transition-all"
        >
          Open History
          <Zap size={10} fill="currentColor" />
        </button>
      </div>
    </div>
  );
}

function DashMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="p-4 apple-glass-panel rounded-2xl min-w-[130px] hover:border-sage-500/20 transition-all">
      <div className="flex items-center gap-2 opacity-60 mb-1">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-widest leading-none">
          {label}
        </span>
      </div>
      <div className="text-lg md:text-xl font-black tracking-tight text-sage-700 dark:text-sage-300 uppercase leading-none">
        {value}
      </div>
    </div>
  );
}

function InsightCard({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  footer: string;
  children: ReactNode;
}) {
  return (
    <div className="p-6 md:p-8 apple-glass-panel rounded-[2rem] space-y-6">
      <div className="space-y-1">
        <h4 className="text-lg font-bold text-sage-900 dark:text-sage-50 uppercase tracking-tight">
          {title}
        </h4>
        <p className="text-xs text-sage-500 font-light italic">{subtitle}</p>
      </div>
      <div className="h-64 w-full min-h-[16rem] min-w-0">{children}</div>
      <div className="text-[10px] font-bold text-sage-500 uppercase tracking-wider border-t border-black/5 dark:border-white/10 pt-3">
        {footer}
      </div>
    </div>
  );
}

function ModuleItem({
  icon,
  title,
  description,
  onClick,
  badge,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  badge: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className="p-8 md:p-10 apple-glass-panel rounded-[2rem] cursor-pointer group transition-all duration-500 relative overflow-hidden flex flex-col hover:shadow-xl hover:shadow-sage-500/5 hover:border-sage-500/30"
    >
      <div className="absolute top-4 right-4 text-[9px] font-black uppercase tracking-widest px-3 py-1 bg-sage-500/10 text-sage-500 rounded-lg border border-sage-500/10">
        {badge}
      </div>

      <div className="p-4 bg-sage-500/5 rounded-2xl w-fit mb-6 group-hover:bg-sage-500/10 transition-all duration-300 shadow-inner">
        {icon}
      </div>

      <div className="space-y-3 flex-grow">
        <h3 className="text-3xl md:text-4xl font-black tracking-tight text-sage-900 dark:text-sage-50 group-hover:text-sage-500 transition-colors uppercase leading-[0.92]">
          {title}
        </h3>
        <p className="text-sm md:text-base text-sage-600 dark:text-sage-400 leading-relaxed font-light italic">
          {description}
        </p>
      </div>

      <div className="flex items-center gap-3 mt-8 text-sage-500 font-bold text-[10px] uppercase tracking-[0.2em] border-t border-black/5 dark:border-white/10 pt-5 opacity-70 group-hover:opacity-100">
        Open Module
        <Zap size={12} fill="currentColor" />
      </div>
    </motion.div>
  );
}
