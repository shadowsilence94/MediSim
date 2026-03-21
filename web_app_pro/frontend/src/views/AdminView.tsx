import { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  Stethoscope,
  Clock,
  CheckCircle,
  AlertCircle,
  Calendar,
  MessageSquare,
  X,
  Activity,
  Trash2,
  Download,
  Search,
} from "lucide-react";
import { apiDelete, apiGet, apiPatchForm } from "../lib/api";
import { motion, AnimatePresence } from "framer-motion";

type Role = "admin" | "physician" | "patient";

interface ProfileResponse {
  status: string;
  profile: {
    email: string;
    role: Role;
  };
}

interface FeedbackItem {
  id: string;
  user_email: string;
  source_type: string;
  source_id: string;
  rating: number;
  condition: string;
  comment: string;
  created_at: string;
}

interface FeedbackResponse {
  status: string;
  feedback: FeedbackItem[];
}

interface CareCase {
  id: string;
  user_email: string;
  message: string;
  status: string;
  created_at: string;
  responses?: {
    nurse: string;
    specialist: string;
    verified: string;
  };
  thread?: any[];
}

interface CasesResponse {
  status: string;
  cases: CareCase[];
}

export default function AdminView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [currentRole, setCurrentRole] = useState<Role>("patient");
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [cases, setCases] = useState<CareCase[]>([]);
  const [caseQuery, setCaseQuery] = useState("");
  const [caseSort, setCaseSort] = useState<
    | "total_desc"
    | "total_asc"
    | "solved_desc"
    | "open_desc"
    | "email_asc"
    | "email_desc"
    | "recent_desc"
  >("total_desc");
  const [feedbackQuery, setFeedbackQuery] = useState("");
  const [feedbackSort, setFeedbackSort] = useState<
    | "date_desc"
    | "date_asc"
    | "rating_desc"
    | "rating_asc"
    | "email_asc"
    | "email_desc"
  >("date_desc");
  const [updatingId, setUpdatingId] = useState("");
  const [selectedCase, setSelectedCase] = useState<CareCase | null>(null);
  const canDeleteCases = currentRole === "admin";

  const groupedUserCases = useMemo(() => {
    const grouped = new Map<
      string,
      {
        user_email: string;
        cases: CareCase[];
        solved: number;
        open: number;
        latest_created_at: string;
      }
    >();

    for (const c of cases) {
      const existing = grouped.get(c.user_email) || {
        user_email: c.user_email,
        cases: [],
        solved: 0,
        open: 0,
        latest_created_at: "",
      };
      existing.cases.push(c);
      if ((c.status || "pending") === "settled") {
        existing.solved += 1;
      } else {
        existing.open += 1;
      }
      if (
        String(c.created_at || "") > String(existing.latest_created_at || "")
      ) {
        existing.latest_created_at = String(c.created_at || "");
      }
      grouped.set(c.user_email, existing);
    }

    return [...grouped.values()].map((group) => ({
      ...group,
      cases: [...group.cases].sort((a, b) =>
        String(b.created_at || "").localeCompare(String(a.created_at || "")),
      ),
    }));
  }, [cases]);

  const visibleGroupedCases = useMemo(() => {
    const q = caseQuery.trim().toLowerCase();
    let data = groupedUserCases;
    if (q) {
      data = data.filter((group) => {
        if (group.user_email.toLowerCase().includes(q)) return true;
        return group.cases.some(
          (c) =>
            c.id.toLowerCase().includes(q) ||
            (c.message || "").toLowerCase().includes(q) ||
            (c.status || "pending").toLowerCase().includes(q),
        );
      });
    }

    const sorted = [...data];
    sorted.sort((a, b) => {
      switch (caseSort) {
        case "total_asc":
          return a.cases.length - b.cases.length;
        case "solved_desc":
          return b.solved - a.solved;
        case "open_desc":
          return b.open - a.open;
        case "email_asc":
          return a.user_email.localeCompare(b.user_email);
        case "email_desc":
          return b.user_email.localeCompare(a.user_email);
        case "recent_desc":
          return String(b.latest_created_at).localeCompare(
            String(a.latest_created_at),
          );
        case "total_desc":
        default:
          return b.cases.length - a.cases.length;
      }
    });

    return sorted;
  }, [groupedUserCases, caseQuery, caseSort]);

  const visibleFeedback = useMemo(() => {
    const q = feedbackQuery.trim().toLowerCase();
    let data = feedback;
    if (q) {
      data = data.filter((f) => {
        return (
          f.user_email.toLowerCase().includes(q) ||
          String(f.source_type || "")
            .toLowerCase()
            .includes(q) ||
          String(f.source_id || "")
            .toLowerCase()
            .includes(q) ||
          String(f.condition || "")
            .toLowerCase()
            .includes(q) ||
          String(f.comment || "")
            .toLowerCase()
            .includes(q)
        );
      });
    }

    const sorted = [...data];
    sorted.sort((a, b) => {
      switch (feedbackSort) {
        case "date_asc":
          return String(a.created_at).localeCompare(String(b.created_at));
        case "rating_desc":
          return Number(b.rating) - Number(a.rating);
        case "rating_asc":
          return Number(a.rating) - Number(b.rating);
        case "email_asc":
          return a.user_email.localeCompare(b.user_email);
        case "email_desc":
          return b.user_email.localeCompare(a.user_email);
        case "date_desc":
        default:
          return String(b.created_at).localeCompare(String(a.created_at));
      }
    });

    return sorted;
  }, [feedback, feedbackQuery, feedbackSort]);

  const toCsvCell = (value: unknown) => {
    const text = String(value ?? "").replace(/\r?\n|\r/g, " ");
    const escaped = text.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const downloadCsv = (filename: string, rows: string[][]) => {
    const csv = rows.map((row) => row.map(toCsvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportGroupedCasesCsv = () => {
    const rows: string[][] = [
      [
        "user_email",
        "case_no",
        "case_id",
        "status",
        "created_at",
        "message",
        "group_total",
        "group_solved",
        "group_open",
      ],
    ];
    for (const group of visibleGroupedCases) {
      group.cases.forEach((c, idx) => {
        rows.push([
          group.user_email,
          String(idx + 1),
          c.id,
          c.status || "pending",
          c.created_at || "",
          c.message || "",
          String(group.cases.length),
          String(group.solved),
          String(group.open),
        ]);
      });
    }
    downloadCsv("care_ops_grouped_history.csv", rows);
  };

  const exportTelemetryCsv = () => {
    const rows: string[][] = [
      [
        "feedback_id",
        "user_email",
        "source_type",
        "source_id",
        "rating",
        "condition",
        "comment",
        "created_at",
      ],
    ];
    for (const f of visibleFeedback) {
      rows.push([
        f.id,
        f.user_email,
        f.source_type,
        f.source_id,
        String(f.rating),
        f.condition || "",
        f.comment || "",
        f.created_at || "",
      ]);
    }
    downloadCsv("care_ops_telemetry_feedback.csv", rows);
  };

  const loadBase = async () => {
    setLoading(true);
    setError("");
    try {
      const me = await apiGet<ProfileResponse>("/me");
      setCurrentRole(me.profile.role);

      if (me.profile.role !== "admin" && me.profile.role !== "physician") {
        setLoading(false);
        return;
      }

      const [fb, cs] = await Promise.all([
        apiGet<FeedbackResponse>("/feedback/all?limit=200"),
        apiGet<CasesResponse>("/care/cases?limit=100"),
      ]);

      setFeedback(fb.feedback || []);
      setCases(cs.cases || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load care operations.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBase();
  }, []);

  const updateCaseStatus = async (caseId: string, newStatus: string) => {
    setUpdatingId(caseId);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("status", newStatus);
      await apiPatchForm(`/care/cases/${caseId}/status`, formData);
      setMessage(
        `Case ${caseId.slice(0, 6)}... status updated to ${newStatus.replace("_", " ")}.`,
      );

      // Optimistic locally
      setCases((prev) =>
        prev.map((c) => (c.id === caseId ? { ...c, status: newStatus } : c)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status.");
    } finally {
      setUpdatingId("");
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "settled":
        return <CheckCircle size={14} className="text-emerald-500" />;
      case "in_progress":
        return <AlertCircle size={14} className="text-amber-500" />;
      case "next_appointment":
        return <Calendar size={14} className="text-blue-500" />;
      default:
        return <Clock size={14} className="text-sage-400" />;
    }
  };

  const deleteFeedbackRecord = async (id: string) => {
    try {
      await apiDelete(`/feedback/${id}`);
      setFeedback((prev: any[]) => prev.filter((f: any) => f.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const deleteCase = async (caseId: string) => {
    if (!canDeleteCases) {
      setError("Only admin can delete cases.");
      return;
    }

    const confirmed = confirm(
      "Delete this case and all its Care Ops thread messages? This cannot be undone.",
    );
    if (!confirmed) return;

    setUpdatingId(caseId);
    setError("");
    setMessage("");
    try {
      await apiDelete(`/care/cases/${caseId}`);
      setCases((prev) => prev.filter((c) => c.id !== caseId));
      if (selectedCase?.id === caseId) {
        setSelectedCase(null);
      }
      setMessage(`Case ${caseId.slice(0, 6)}... deleted successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete case.");
    } finally {
      setUpdatingId("");
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-8 py-12">
        <div className="text-sage-500 font-bold uppercase tracking-widest text-xs">
          Loading clinical cases...
        </div>
      </div>
    );
  }

  if (currentRole !== "admin" && currentRole !== "physician") {
    return (
      <div className="max-w-4xl mx-auto px-8 py-12">
        <div className="p-6 rounded-2xl bg-white/50 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sage-600">
          This workspace is available for authenticated Care Ops personnel only.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-8 py-12 space-y-8 relative">
      <div className="space-y-2 relative z-10">
        <div className="text-[10px] uppercase tracking-[0.3em] text-sage-500 font-bold flex items-center gap-2">
          <Stethoscope size={14} /> Care Operations System
        </div>
        <h2 className="text-4xl font-black tracking-tight text-sage-900 dark:text-sage-50 uppercase drop-shadow-sm">
          {currentRole === "admin"
            ? "Admin Triage Queue"
            : "Physician Triage Queue"}
        </h2>
      </div>

      {message && (
        <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-700 font-medium relative z-10">
          {message}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 text-red-600 font-medium relative z-10">
          {error}
        </div>
      )}

      <div className="space-y-8 relative z-10">
        <section className="p-6 rounded-3xl bg-white/40 dark:bg-white/5 border border-black/10 dark:border-white/10 space-y-5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-sage-500/5 blur-[80px] rounded-full pointer-events-none" />

          <div className="flex items-center justify-between gap-3 flex-wrap text-sage-700 dark:text-sage-300 font-bold uppercase text-xs tracking-wider relative z-10">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} /> Grouped Care Ops History
            </div>
            <button
              onClick={exportGroupedCasesCsv}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sage-700 text-white text-[10px] font-black uppercase tracking-wider hover:bg-sage-600 transition-colors"
            >
              <Download size={12} /> Export CSV
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-3 relative z-10">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/60 dark:bg-black/30 border border-black/10 dark:border-white/10">
              <Search size={14} className="text-sage-500" />
              <input
                value={caseQuery}
                onChange={(e) => setCaseQuery(e.target.value)}
                placeholder="Search user, case id, status, message"
                className="w-full bg-transparent outline-none text-xs text-sage-800 dark:text-sage-200 placeholder:text-sage-500"
              />
            </div>
            <select
              value={caseSort}
              onChange={(e) =>
                setCaseSort(
                  e.target.value as
                    | "total_desc"
                    | "total_asc"
                    | "solved_desc"
                    | "open_desc"
                    | "email_asc"
                    | "email_desc"
                    | "recent_desc",
                )
              }
              className="px-3 py-2 text-xs font-bold rounded-xl bg-white/60 dark:bg-black/30 border border-black/10 dark:border-white/10 outline-none focus:ring-2 focus:ring-sage-500/40 text-sage-800 dark:text-sage-200"
            >
              <option value="total_desc">Sort: Total cases (desc)</option>
              <option value="total_asc">Sort: Total cases (asc)</option>
              <option value="solved_desc">Sort: Solved (desc)</option>
              <option value="open_desc">Sort: Open (desc)</option>
              <option value="recent_desc">Sort: Most recent case</option>
              <option value="email_asc">Sort: Email A-Z</option>
              <option value="email_desc">Sort: Email Z-A</option>
            </select>
          </div>

          {visibleGroupedCases.length === 0 && (
            <div className="py-8 text-center text-xs font-medium text-sage-500/50 uppercase tracking-widest italic">
              No grouped user history available yet.
            </div>
          )}

          <div className="space-y-4 relative z-10">
            {visibleGroupedCases.map((group) => (
              <div
                key={group.user_email}
                className="rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/20 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-black/5 dark:border-white/5 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-black text-sage-900 dark:text-sage-100">
                    {group.user_email}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider">
                      <span className="px-2 py-1 rounded-full bg-sage-500/10 text-sage-700 border border-sage-500/20">
                        Total: {group.cases.length}
                      </span>
                      <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                        Solved: {group.solved}
                      </span>
                      <span className="px-2 py-1 rounded-full bg-amber-500/10 text-amber-700 border border-amber-500/20">
                        Open: {group.open}
                      </span>
                    </div>
                    <div className="text-[10px] text-sage-600 dark:text-sage-400">
                      Latest case:{" "}
                      {group.latest_created_at
                        ? new Date(group.latest_created_at).toLocaleString()
                        : "N/A"}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-black/5 dark:border-white/5 text-[10px] uppercase tracking-widest text-sage-500">
                        <th className="py-2 px-4 font-black">No.</th>
                        <th className="py-2 px-4 font-black">Case ID</th>
                        <th className="py-2 px-4 font-black">Created</th>
                        <th className="py-2 px-4 font-black">Context</th>
                        <th className="py-2 px-4 font-black">Trace</th>
                        <th className="py-2 px-4 font-black text-right">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.cases.map((c, idx) => (
                        <tr
                          key={c.id}
                          className="border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5"
                        >
                          <td className="py-3 px-4 text-xs font-black text-sage-700 dark:text-sage-300">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4 text-xs font-mono text-sage-500">
                            {c.id.slice(0, 10)}
                          </td>
                          <td className="py-3 px-4 text-xs text-sage-600 dark:text-sage-400 whitespace-nowrap">
                            {c.created_at
                              ? new Date(c.created_at).toLocaleString()
                              : "N/A"}
                          </td>
                          <td className="py-3 px-4 text-xs text-sage-700 dark:text-sage-300 max-w-xs truncate">
                            {c.message}
                          </td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => setSelectedCase(c)}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sage-500/10 text-sage-600 hover:bg-sage-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-wider"
                            >
                              <MessageSquare size={12} /> Transcript
                            </button>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {getStatusIcon(c.status || "pending")}
                              <select
                                value={c.status || "pending"}
                                disabled={updatingId === c.id}
                                onChange={(e) =>
                                  updateCaseStatus(c.id, e.target.value)
                                }
                                className="p-1.5 px-3 text-xs font-bold rounded-lg bg-white dark:bg-black/40 border border-black/10 dark:border-white/10 outline-none focus:ring-2 focus:ring-sage-500/40 text-sage-800 dark:text-sage-200 cursor-pointer disabled:opacity-50"
                              >
                                <option value="pending">Pending Review</option>
                                <option value="in_progress">In Progress</option>
                                <option value="next_appointment">
                                  Next Appointment
                                </option>
                                <option value="settled">
                                  Settled / Closed
                                </option>
                              </select>
                              {canDeleteCases && (
                                <button
                                  onClick={() => deleteCase(c.id)}
                                  disabled={updatingId === c.id}
                                  className="p-2 rounded-lg border border-red-500/20 text-red-600 hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50"
                                  title="Delete case"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="p-6 rounded-3xl bg-white/40 dark:bg-white/5 border border-black/10 dark:border-white/10 space-y-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between gap-3 flex-wrap text-sage-700 dark:text-sage-300 font-bold uppercase text-xs tracking-wider relative z-10">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} /> System Telemetry & Feedback
            </div>
            <button
              onClick={exportTelemetryCsv}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sage-700 text-white text-[10px] font-black uppercase tracking-wider hover:bg-sage-600 transition-colors"
            >
              <Download size={12} /> Export CSV
            </button>
          </div>
          <div className="grid md:grid-cols-2 gap-3 relative z-10">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/60 dark:bg-black/30 border border-black/10 dark:border-white/10">
              <Search size={14} className="text-sage-500" />
              <input
                value={feedbackQuery}
                onChange={(e) => setFeedbackQuery(e.target.value)}
                placeholder="Search email, source id, condition, comment"
                className="w-full bg-transparent outline-none text-xs text-sage-800 dark:text-sage-200 placeholder:text-sage-500"
              />
            </div>
            <select
              value={feedbackSort}
              onChange={(e) =>
                setFeedbackSort(
                  e.target.value as
                    | "date_desc"
                    | "date_asc"
                    | "rating_desc"
                    | "rating_asc"
                    | "email_asc"
                    | "email_desc",
                )
              }
              className="px-3 py-2 text-xs font-bold rounded-xl bg-white/60 dark:bg-black/30 border border-black/10 dark:border-white/10 outline-none focus:ring-2 focus:ring-sage-500/40 text-sage-800 dark:text-sage-200"
            >
              <option value="date_desc">Sort: Newest first</option>
              <option value="date_asc">Sort: Oldest first</option>
              <option value="rating_desc">Sort: Rating high-low</option>
              <option value="rating_asc">Sort: Rating low-high</option>
              <option value="email_asc">Sort: Email A-Z</option>
              <option value="email_desc">Sort: Email Z-A</option>
            </select>
          </div>
          <div className="space-y-2 max-h-72 overflow-auto custom-scrollbar relative z-10 pr-2">
            {visibleFeedback.map((f) => (
              <div
                key={f.id}
                className="p-4 rounded-2xl border border-black/5 dark:border-white/5 bg-white/60 dark:bg-black/20 hover:bg-white dark:hover:bg-black/40 transition-colors shadow-sm"
              >
                <div className="flex justify-between items-center mb-1 gap-2">
                  <div className="text-xs font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider truncate">
                    {f.user_email}
                  </div>
                  <div className="flex items-center gap-2">
                      <div className="text-[10px] font-bold text-sage-500 border border-sage-500/20 px-2 py-0.5 rounded-full shrink-0">
                        Rating: {f.rating}/5
                      </div>
                      {canDeleteCases && (
                          <button onClick={() => deleteFeedbackRecord(f.id)} className="p-1 rounded bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors">
                              <Trash2 size={12} />
                          </button>
                      )}
                  </div>
                </div>
                <div className="text-[11px] text-sage-500 uppercase tracking-widest font-semibold mb-1">
                  Condition: {f.condition || "N/A"}
                </div>
                <div className="text-[10px] text-sage-600 dark:text-sage-400 mb-2 break-all">
                  Trace: src={f.source_type} | source_id={f.source_id} | id=
                  {f.id}
                </div>
                <div className="text-[10px] text-sage-500 mb-2">
                  {f.created_at
                    ? new Date(f.created_at).toLocaleString()
                    : "No timestamp"}
                </div>
                <div className="text-sm text-sage-800 dark:text-sage-200 leading-relaxed">
                  {f.comment || (
                    <span className="italic opacity-50">
                      No attached commentary.
                    </span>
                  )}
                </div>
              </div>
            ))}
            {visibleFeedback.length === 0 && (
              <div className="py-6 text-center text-xs font-medium text-sage-500/50 uppercase tracking-widest italic">
                No telemetry records for current filters.
              </div>
            )}
          </div>
        </section>
      </div>

      <AnimatePresence>
        {selectedCase && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
            onClick={() => setSelectedCase(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-2xl overflow-hidden border border-black/10 dark:border-white/10 flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-sage-50 dark:bg-sage-900/20">
                <div className="flex items-center gap-3">
                  <Activity size={20} className="text-sage-500" />
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-sage-500 mb-0.5">
                      Neural Transcript Analysis • {selectedCase.id.slice(0, 8)}
                    </div>
                    <h3 className="text-base font-black text-sage-900 dark:text-sage-50 uppercase italic">
                      {selectedCase.user_email}
                    </h3>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCase(null)}
                  className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                >
                  <X size={20} className="text-sage-700 dark:text-sage-300" />
                </button>
              </div>

              <div className="p-8 overflow-y-auto flex-grow space-y-8 custom-scrollbar bg-white/50 dark:bg-black/20">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-sage-500">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>{" "}
                    Nurse Interaction Report
                  </div>
                  <div className="p-6 rounded-2xl bg-white dark:bg-black/40 border border-black/5 dark:border-white/5 text-sm font-light leading-relaxed text-sage-900 dark:text-sage-100 italic">
                    {selectedCase.responses?.nurse ||
                      "No nurse deliberation recorded."}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-sage-500">
                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>{" "}
                    Specialist Clinical Advice
                  </div>
                  <div className="p-6 rounded-2xl bg-white dark:bg-black/40 border border-black/5 dark:border-white/5 text-sm font-light leading-relaxed text-sage-900 dark:text-sage-100 italic">
                    {selectedCase.responses?.specialist ||
                      "No specialist deliberation recorded."}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-sage-500">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>{" "}
                    Fact Checker Audit
                  </div>
                  <div className="p-6 rounded-2xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 text-sm font-bold leading-relaxed text-emerald-900 dark:text-emerald-300">
                    {selectedCase.responses?.verified ||
                      "No audit transcript available."}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-black/5 dark:border-white/5 bg-gray-50/50 dark:bg-black/40 flex justify-end">
                <div className="flex items-center gap-3">
                  {canDeleteCases && (
                    <button
                      onClick={() => deleteCase(selectedCase.id)}
                      disabled={updatingId === selectedCase.id}
                      className="px-5 py-2.5 rounded-xl bg-red-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-500 transition-colors shadow-lg disabled:opacity-50"
                    >
                      Delete Case
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedCase(null)}
                    className="px-8 py-2.5 rounded-xl bg-sage-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-sage-700 transition-colors shadow-lg"
                  >
                    Close Transcript
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
