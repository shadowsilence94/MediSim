import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  History as HistoryIcon,
  Search,
  Database,
  Thermometer,
  MessageSquare,
  ArrowUpRight,
  Loader2,
  Shield,
  X,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { apiGet, apiDelete } from "../lib/api";

interface Session {
  id: string;
  patientName: string;
  type: "diagnostic" | "triage";
  fidelity: number;
  date: string;
  summary: string;
  full_content?: any;
}

interface ConversationGroup {
  id: string;
  type: "diagnostic" | "triage";
  sessions: Session[];
  dateRange: { start: string; end: string };
  avgFidelity: number;
  sessionCount: number;
  checked: boolean;
}

interface HistoryResponse {
  status: string;
  sessions: Session[];
}

interface MeResponse {
  status: string;
  profile: {
    email: string;
    role: "admin" | "physician" | "patient";
  };
}

export default function HistoryView() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [selfEmail, setSelfEmail] = useState("");
  const [role, setRole] = useState<"admin" | "physician" | "patient">(
    "patient",
  );
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [checkedGroups, setCheckedGroups] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const [me, data] = await Promise.all([
          apiGet<MeResponse>("/me"),
          apiGet<HistoryResponse>("/records/history?limit=100"),
        ]);
        setSelfEmail(String(me?.profile?.email || "").toLowerCase());
        setRole(me?.profile?.role || "patient");
        setSessions(data.sessions || []);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  // Group history strictly by session so each record is its own group for now, but we'll show them as distinct instances
  const conversationGroups = useMemo<ConversationGroup[]>(() => {
    const filteredSessions = sessions.filter(
      (s) =>
        (s.patientName.toLowerCase().includes(filter.toLowerCase()) ||
          s.summary.toLowerCase().includes(filter.toLowerCase())) &&
        (!selfEmail || String(s.patientName || "").toLowerCase() === selfEmail),
    );

    // Session-based grouping for both triage and diagnostic records.
    const groups = new Map<string, Session[]>();

    for (const session of filteredSessions) {
      const groupKey = `${session.type}-${session.id}`;
      const group = groups.get(groupKey) || [];
      group.push(session);
      groups.set(groupKey, group);
    }

    // Convert to ConversationGroup array with metadata
    return Array.from(groups.entries())
      .map(([key, groupSessions]) => {
        const dates = groupSessions.map((s) => new Date(s.date).getTime());
        const startDate = new Date(Math.min(...dates));
        const endDate = new Date(Math.max(...dates));
        const avgFidelity =
          groupSessions.reduce((sum, s) => sum + s.fidelity, 0) /
          groupSessions.length;

        return {
          id: key,
          type: groupSessions[0]!.type,
          sessions: groupSessions.sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
          ),
          dateRange: {
            start: startDate.toLocaleDateString(),
            end: endDate.toLocaleDateString(),
          },
          avgFidelity,
          sessionCount: groupSessions.length,
          checked: checkedGroups.has(key),
        };
      })
      .sort(
        (a, b) =>
          new Date(b.sessions[0]!.date).getTime() -
          new Date(a.sessions[0]!.date).getTime(),
      );
  }, [sessions, filter, selfEmail, checkedGroups]);

  const toggleGroupCheckbox = (groupId: string) => {
    const newChecked = new Set(checkedGroups);
    if (newChecked.has(groupId)) {
      newChecked.delete(groupId);
    } else {
      newChecked.add(groupId);
    }
    setCheckedGroups(newChecked);
  };

  const handleCheckboxClick = (
    e: ChangeEvent<HTMLInputElement>,
    groupId: string,
  ) => {
    e.stopPropagation();
    toggleGroupCheckbox(groupId);
  };

  const toggleGroupExpand = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const deleteRecord = async (session: Session) => {
    if (
      !confirm(
        "Are you sure you want to permanently delete this inference record?",
      )
    )
      return;
    try {
      await apiDelete(`/records/history/${session.type}/${session.id}`);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
      if (selectedSession?.id === session.id) setSelectedSession(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete record.");
    }
  };

  const bulkDeleteGroups = async () => {
    if (checkedGroups.size === 0) return;
    const groupIds = Array.from(checkedGroups);
    const sessionsToDelete = conversationGroups
      .filter((g) => checkedGroups.has(g.id))
      .flatMap((g) => g.sessions);
    const totalRecords = conversationGroups
      .filter((g) => checkedGroups.has(g.id))
      .reduce((sum, g) => sum + g.sessionCount, 0);

    if (
      !confirm(
        `Delete ${groupIds.length} conversation group(s) containing ${totalRecords} total record(s)? This action cannot be undone.`,
      )
    )
      return;

    try {
      let deleteCount = 0;
      for (const groupId of groupIds) {
        const group = conversationGroups.find((g) => g.id === groupId);
        if (!group) continue;
        for (const session of group.sessions) {
          try {
            await apiDelete(`/records/history/${session.type}/${session.id}`);
            deleteCount++;
          } catch (err) {
            console.error(`Failed to delete session ${session.id}:`, err);
          }
        }
      }
      setSessions((prev) =>
        prev.filter(
          (s) => !sessionsToDelete.some((session) => session.id === s.id),
        ),
      );
      setCheckedGroups(new Set());
      setSelectedSession(null);
      alert(`Successfully deleted ${deleteCount} record(s).`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete groups.");
    }
  };

  const filteredSessions = sessions.filter(
    (s) =>
      s.patientName.toLowerCase().includes(filter.toLowerCase()) ||
      s.summary.toLowerCase().includes(filter.toLowerCase()),
  );

  const visibleSessions = filteredSessions.filter((s) => {
    if (role === "admin" || role === "physician") return true;
    if (!selfEmail) return true;
    return String(s.patientName || "").toLowerCase() === selfEmail;
  });

  const groupedByUser = useMemo(() => {
    if (!(role === "admin" || role === "physician"))
      return [] as Array<{
        userEmail: string;
        groups: ConversationGroup[];
      }>;

    const byUser = new Map<string, ConversationGroup[]>();
    for (const group of conversationGroups) {
      const first = group.sessions[0];
      const userEmail = String(first?.patientName || "Unknown User");
      const existing = byUser.get(userEmail) || [];
      existing.push(group);
      byUser.set(userEmail, existing);
    }

    return Array.from(byUser.entries())
      .map(([userEmail, groups]) => ({
        userEmail,
        groups: groups.sort(
          (a, b) =>
            new Date(b.sessions[0]!.date).getTime() -
            new Date(a.sessions[0]!.date).getTime(),
        ),
      }))
      .sort((a, b) => a.userEmail.localeCompare(b.userEmail));
  }, [conversationGroups, role]);

  return (
    <div className="max-w-6xl mx-auto px-8 py-12 flex flex-col min-h-screen pb-32">
      <div className="space-y-12">
        <div className="flex flex-col md:flex-row justify-between items-end gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sage-500">
              <HistoryIcon size={16} />
              <span className="text-[10px] font-bold uppercase tracking-[0.3em]">
                Module 03
              </span>
            </div>
            <h2 className="text-5xl font-black tracking-tight text-sage-900 dark:text-sage-50 uppercase leading-none italic">
              Clinical <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-br from-sage-500 to-sage-700 not-italic font-black">
                Chronicle
              </span>
            </h2>
            <p className="text-sage-600 dark:text-sage-400 font-light italic leading-relaxed max-w-lg">
              Immutable audit trail of past deliberations and diagnostic signals
              vaulted within the secure neural storage.
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
            <div className="glass flex items-center px-6 py-4 gap-4 flex-grow md:w-80 border-black/5 dark:border-white/5 rounded-2xl shadow-inner focus-within:ring-2 focus-within:ring-sage-500/20 transition-all">
              <Search size={18} className="text-sage-500 opacity-60" />
              <input
                type="text"
                placeholder="Query Archival Signal..."
                className="bg-transparent border-none outline-none text-xs font-light italic text-sage-900 dark:text-sage-100 placeholder:text-sage-600 dark:placeholder:text-sage-400 w-full"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <div className="px-6 py-4 bg-sage-500/5 rounded-2xl border border-sage-500/10 flex items-center justify-center gap-3">
              <Database size={16} className="text-sage-500" />
              <span className="text-[10px] font-black text-sage-900 dark:text-sage-50 uppercase tracking-[0.2em]">
                {role === "admin" || role === "physician"
                  ? `${groupedByUser.length} Users • ${conversationGroups.length} Sessions • ${visibleSessions.length} Records`
                  : `${conversationGroups.length} Groups • ${visibleSessions.length} Records`}
              </span>
            </div>
            {checkedGroups.size > 0 && (
              <button
                onClick={bulkDeleteGroups}
                className="px-6 py-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-3 hover:bg-red-500 hover:text-white transition-all group"
              >
                <Trash2
                  size={16}
                  className="group-hover:scale-110 transition-transform"
                />
                <span className="text-[10px] font-black text-red-600 group-hover:text-white uppercase tracking-[0.2em]">
                  Delete {checkedGroups.size} Groups
                </span>
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="py-40 flex flex-col items-center gap-8 opacity-30">
            <div className="relative">
              <Loader2 className="animate-spin" size={64} />
              <div className="absolute inset-0 bg-sage-500 blur-[40px] opacity-20 animate-pulse"></div>
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.5em] italic">
              Decrypting Neural Vault...
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {conversationGroups.length === 0 ? (
              <div className="py-40 text-center space-y-6 opacity-30">
                <Shield className="mx-auto" size={80} />
                <p className="text-[10px] font-black uppercase tracking-[0.5em] italic">
                  No Records Found In Persistent Secure Archive
                </p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {role === "admin" || role === "physician"
                  ? groupedByUser.flatMap((userGroup, userIdx) => {
                      const header = (
                        <motion.div
                          key={`user-${userGroup.userEmail}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ delay: userIdx * 0.04 }}
                          className="px-4 py-3 rounded-2xl border border-sage-500/20 bg-sage-500/5 mt-8 first:mt-0"
                        >
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-sage-500">
                            Patient / User
                          </div>
                          <div className="text-sm font-bold text-sage-900 dark:text-sage-50 break-all">
                            {userGroup.userEmail}
                          </div>
                          <div className="text-[10px] text-sage-600 dark:text-sage-400 mt-1">
                            {userGroup.groups.length} Records Detected
                          </div>
                        </motion.div>
                      );

                      const sessions = userGroup.groups.map((group, idx) => (
                        <motion.div
                          key={group.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ delay: idx * 0.03 }}
                          className="ml-4 bg-white/40 dark:bg-white/5 backdrop-blur-3xl border border-black/5 dark:border-white/5 rounded-[2rem] overflow-hidden shadow-xl hover:shadow-2xl transition-all group"
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleGroupExpand(group.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleGroupExpand(group.id);
                              }
                            }}
                            className="w-full p-6 flex items-center justify-between bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-all"
                          >
                            <div className="flex items-center gap-6 flex-grow text-left">
                              <input
                                type="checkbox"
                                checked={group.checked}
                                onChange={(e) =>
                                  handleCheckboxClick(e, group.id)
                                }
                                className="w-5 h-5 rounded-lg border border-sage-500 bg-white dark:bg-black/50 cursor-pointer accent-sage-500"
                              />
                              <div className="flex items-center gap-4">
                                {group.type === "diagnostic" ? (
                                  <div className="p-3 bg-blue-500/10 rounded-full">
                                    <Thermometer
                                      size={20}
                                      className="text-blue-600 dark:text-blue-400"
                                    />
                                  </div>
                                ) : (
                                  <div className="p-3 bg-emerald-500/10 rounded-full">
                                    <MessageSquare
                                      size={20}
                                      className="text-emerald-600 dark:text-emerald-400"
                                    />
                                  </div>
                                )}
                                <div>
                                  <div className="text-sm font-black text-sage-900 dark:text-sage-50 uppercase tracking-tight">
                                    {group.type.charAt(0).toUpperCase() +
                                      group.type.slice(1)}{" "}
                                    Session
                                  </div>
                                  <div className="text-[10px] font-medium text-sage-600 dark:text-sage-400">
                                    {group.dateRange.start}
                                    {group.dateRange.start !==
                                      group.dateRange.end &&
                                      ` — ${group.dateRange.end}`}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-6 w-1/3">
                              <div className="text-right space-y-1">
                                <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md ${
                                    group.type === "diagnostic" ? "bg-blue-500/10 text-blue-700" : "bg-emerald-500/10 text-emerald-700"
                                }`}>
                                    {(group.avgFidelity * 100).toFixed(1)}% Confidence
                                </span>
                              </div>
                              <div className="p-2 rounded-lg bg-white/60 dark:bg-white/5 border border-black/5 dark:border-white/10 shrink-0">
                                {expandedGroups.has(group.id) ? (
                                  <ChevronUp
                                    size={18}
                                    className="text-sage-600"
                                  />
                                ) : (
                                  <ChevronDown
                                    size={18}
                                    className="text-sage-600"
                                  />
                                )}
                              </div>
                            </div>
                          </div>

                          <AnimatePresence>
                            {expandedGroups.has(group.id) && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden border-t border-black/5 dark:border-white/5"
                              >
                                <div className="p-6 space-y-3">
                                  {group.sessions.map((session, sessionIdx) => (
                                    <motion.div
                                      key={session.id}
                                      initial={{ opacity: 0, x: -10 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: sessionIdx * 0.05 }}
                                      className={`p-4 rounded-xl transition-all group/session border ${
                                          session.type === 'diagnostic' ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30' 
                                          : 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/30'
                                      }`}
                                    >
                                      <div className="flex items-start justify-between gap-4">
                                        <div>
                                          <div className="text-sm font-bold text-sage-900 dark:text-sage-50 mb-1 leading-snug">
                                            {session.summary}
                                          </div>
                                          <div className="flex flex-wrap gap-4 text-[10px] font-mono text-sage-600 dark:text-sage-400 mt-2">
                                            <span>
                                              ID: {session.id.slice(0, 12)}...
                                            </span>
                                            <span>
                                              {new Date(
                                                session.date,
                                              ).toLocaleString("en-US", {
                                                month: 'short', day: 'numeric', year: 'numeric',
                                                hour: "2-digit",
                                                minute: "2-digit",
                                              })}
                                            </span>
                                          </div>
                                        </div>

                                        <div className="flex gap-2 shrink-0">
                                          <button
                                            onClick={() =>
                                              setSelectedSession(session)
                                            }
                                            className="p-2 rounded-lg bg-white/60 dark:bg-white/5 border border-black/10 text-sage-700 dark:text-sage-300 hover:bg-sage-900 hover:text-white transition-all opacity-0 group-hover/session:opacity-100"
                                            title="View details"
                                          >
                                            <ArrowUpRight size={16} />
                                          </button>
                                          <button
                                            onClick={() =>
                                              deleteRecord(session)
                                            }
                                            className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover/session:opacity-100"
                                            title="Delete record"
                                          >
                                            <Trash2 size={16} />
                                          </button>
                                        </div>
                                      </div>

                                      {session.full_content?.thread && session.full_content.thread.length > 0 && (
                                        <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/5 space-y-2">
                                          <div className={`text-[9px] font-black uppercase tracking-widest mb-2 ${session.type === 'diagnostic' ? 'text-blue-500' : 'text-emerald-500'}`}>Session Trace Threads</div>
                                          {session.full_content.thread.map((msg: any) => (
                                            <div key={msg.id} className="flex gap-4 p-2.5 bg-white/40 dark:bg-black/20 rounded-xl">
                                              <div className={`text-[9px] font-black uppercase tracking-widest w-20 shrink-0 mt-0.5 ${msg.agent_role === 'patient' ? 'text-sage-400' : 'text-emerald-500'}`}>
                                                {msg.agent_role.replace('_', ' ')}
                                              </div>
                                              <div className="text-xs font-medium text-sage-800 dark:text-sage-200 leading-relaxed">
                                                {msg.message}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </motion.div>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      ));

                      return [header, ...sessions];
                    })
                  : conversationGroups.map((group, idx) => (
                      <motion.div
                        key={group.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ delay: idx * 0.05 }}
                        className="bg-white/40 dark:bg-white/5 backdrop-blur-3xl border border-black/5 dark:border-white/5 rounded-[2rem] overflow-hidden shadow-xl hover:shadow-2xl transition-all group"
                      >
                        {/* Group Header */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleGroupExpand(group.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleGroupExpand(group.id);
                            }
                          }}
                          className="w-full p-6 flex items-center justify-between bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-all"
                        >
                          <div className="flex items-center gap-6 flex-grow text-left">
                            <input
                              type="checkbox"
                              checked={group.checked}
                              onChange={(e) => handleCheckboxClick(e, group.id)}
                              className="w-5 h-5 rounded-lg border border-sage-500 bg-white dark:bg-black/50 cursor-pointer accent-sage-500"
                            />
                            <div className="flex items-center gap-4">
                              {group.type === "diagnostic" ? (
                                <Thermometer
                                  size={20}
                                  className="text-sage-600 dark:text-sage-400"
                                />
                              ) : (
                                <MessageSquare
                                  size={20}
                                  className="text-sage-600 dark:text-sage-400"
                                />
                              )}
                              <div>
                                <div className="text-sm font-black text-sage-900 dark:text-sage-50 uppercase tracking-tight">
                                  {group.type.charAt(0).toUpperCase() +
                                    group.type.slice(1)}{" "}
                                  Group
                                </div>
                                <div className="text-[10px] font-medium text-sage-600 dark:text-sage-400">
                                  {group.dateRange.start}
                                  {group.dateRange.start !==
                                    group.dateRange.end &&
                                    ` — ${group.dateRange.end}`}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-6">
                            <div className="text-right space-y-1">
                              <div className="text-xs font-black text-sage-900 dark:text-sage-50">
                                {group.sessionCount} Records
                              </div>
                              <div className="text-[10px] font-medium text-sage-600 dark:text-sage-400">
                                Avg Integrity:{" "}
                                {(group.avgFidelity * 100).toFixed(1)}%
                              </div>
                            </div>
                            <div className="p-2 rounded-lg bg-white/60 dark:bg-white/5 border border-black/5 dark:border-white/10">
                              {expandedGroups.has(group.id) ? (
                                <ChevronUp
                                  size={18}
                                  className="text-sage-600"
                                />
                              ) : (
                                <ChevronDown
                                  size={18}
                                  className="text-sage-600"
                                />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Expanded Sessions List */}
                        <AnimatePresence>
                          {expandedGroups.has(group.id) && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden border-t border-black/5 dark:border-white/5"
                            >
                              <div className="p-6 space-y-3">
                                {group.sessions.map((session, sessionIdx) => (
                                  <motion.div
                                    key={session.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: sessionIdx * 0.05 }}
                                    className="p-4 rounded-xl bg-white/50 dark:bg-black/20 border border-black/5 dark:border-white/10 hover:bg-white/70 dark:hover:bg-black/40 transition-all group/session"
                                  >
                                    <div className="flex items-start justify-between gap-4">
                                      <div>
                                        <div className="text-sm font-bold text-sage-900 dark:text-sage-50 mb-1">
                                          {session.summary}
                                        </div>
                                        <div className="flex gap-4 text-[10px] font-medium text-sage-600 dark:text-sage-400">
                                          <span>
                                            ID: {session.id.slice(0, 12)}...
                                          </span>
                                          <span>
                                            {new Date(
                                              session.date,
                                            ).toLocaleDateString()}{" "}
                                            {new Date(
                                              session.date,
                                            ).toLocaleTimeString("en-US", {
                                              hour: "2-digit",
                                              minute: "2-digit",
                                            })}
                                          </span>
                                          <span>
                                            Integrity:{" "}
                                            {(session.fidelity * 100).toFixed(
                                              1,
                                            )}
                                            %
                                          </span>
                                        </div>
                                      </div>

                                      <div className="flex gap-2">
                                        <button
                                          onClick={() =>
                                            setSelectedSession(session)
                                          }
                                          className="p-2 rounded-lg bg-white/60 dark:bg-white/5 border border-black/5 dark:border-white/10 text-sage-700 dark:text-sage-300 hover:bg-sage-900 hover:text-white transition-all opacity-0 group-hover/session:opacity-100"
                                          title="View details"
                                        >
                                          <ArrowUpRight size={16} />
                                        </button>
                                        <button
                                          onClick={() => deleteRecord(session)}
                                          className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover/session:opacity-100"
                                          title="Delete record"
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      </div>
                                    </div>
                                  </motion.div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    ))}
              </AnimatePresence>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedSession && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md pb-20"
            onClick={() => setSelectedSession(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl bg-[#eaeee8] dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden border border-black/10 dark:border-white/10 flex flex-col max-h-[85vh]"
            >
              <div className="p-6 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-white/30 dark:bg-sage-900/20">
                <div>
                  <div className={`text-[10px] font-black uppercase tracking-[0.3em] mb-1 ${
                      selectedSession.type === 'diagnostic' ? 'text-blue-600' : 'text-emerald-600'
                  }`}>
                    {selectedSession.type} Inference Trace
                  </div>
                  <h3 className="text-xl font-black text-sage-900 dark:text-sage-50">
                    {selectedSession.patientName}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedSession(null)}
                  className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                >
                  <X size={20} className="text-sage-700 dark:text-sage-300" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-grow space-y-6">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-sage-500 mb-2">
                    Inference Integrity Record
                  </div>
                  <div className="p-4 bg-white/50 dark:bg-white/5 rounded-2xl text-[11px] font-mono text-sage-800 dark:text-sage-200">
                    <span className="opacity-50">ID:</span> {selectedSession.id} <br />
                    <span className="opacity-50">Date:</span> {new Date(selectedSession.date).toLocaleString()} <br />
                    <span className="opacity-50">Confidence Metric:</span> {(selectedSession.fidelity * 100).toFixed(2)}%
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-sage-500 mb-2">
                    Extracted Payload
                  </div>
                  <div className="p-5 bg-white shadow-sm dark:bg-sage-900/10 rounded-2xl text-xs font-medium text-sage-900 dark:text-sage-100 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto custom-scrollbar border border-black/5">
                    {selectedSession.type === 'diagnostic' ? (
                        <div className="space-y-4">
                            <div>
                                <strong className="text-sage-500 text-[10px] uppercase">Symptoms:</strong>
                                <p className="mt-1">{selectedSession.full_content?.symptoms || 'None'}</p>
                            </div>
                            <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                                <strong className="text-blue-500 text-[10px] uppercase">Prediction Result:</strong>
                                <p className="mt-1 font-bold">{selectedSession.full_content?.model_prediction_label}</p>
                                <p className="text-xs opacity-70 mt-1">{selectedSession.full_content?.details}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <strong className="text-sage-500 text-[10px] uppercase">Initial Query:</strong>
                                <p className="mt-1 p-3 bg-sage-50 rounded-xl">{selectedSession.full_content?.message}</p>
                            </div>
                            {selectedSession.full_content?.thread && selectedSession.full_content.thread.length > 0 ? (
                                <div className="space-y-4 pt-4 border-t border-black/5 dark:border-white/5">
                                    <strong className="text-emerald-500 text-[10px] uppercase pb-1 flex w-full">Full Session Transcript</strong>
                                    <div className="flex flex-col gap-3">
                                      {selectedSession.full_content.thread.map((msg: any) => (
                                          <div key={msg.id} className="p-3 bg-white/60 dark:bg-black/40 border border-sage-100 dark:border-white/10 rounded-xl text-sage-900 dark:text-sage-100 text-xs">
                                              <div className={`text-[9px] font-black uppercase mb-1 ${msg.agent_role === 'patient' ? 'text-sage-500' : 'text-emerald-500'}`}>{msg.agent_role.replace('_', ' ')}</div>
                                              <div className="leading-relaxed">{msg.message}</div>
                                          </div>
                                      ))}
                                    </div>
                                </div>
                            ) : selectedSession.full_content?.agent_response && (
                                <div className="space-y-3 mt-4">
                                    <strong className="text-emerald-500 text-[10px] uppercase border-b border-emerald-500/20 pb-1 flex w-full">Agent Responses</strong>
                                    {Object.entries(selectedSession.full_content.agent_response).map(([agent, resp]) => {
                                        if (!resp || agent === 'response_order') return null;
                                        return (
                                            <div key={agent} className="p-3 bg-white dark:bg-black/40 border border-sage-100 dark:border-white/10 rounded-xl text-sage-800 dark:text-sage-200">
                                                <div className="text-[9px] font-black uppercase text-sage-400 dark:text-sage-500 mb-1">{agent.replace('_', ' ')}</div>
                                                <div className="text-xs leading-relaxed">{String(resp)}</div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-black/5 dark:border-white/5 bg-white/50 backdrop-blur-md flex justify-between items-center shrink-0">
                <button
                  onClick={() => deleteRecord(selectedSession)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white transition-colors text-xs font-bold uppercase tracking-wider"
                >
                  <Trash2 size={16} /> Destroy Record
                </button>
                <button
                  onClick={() => setSelectedSession(null)}
                  className="px-6 py-2 rounded-xl bg-sage-700 text-white text-xs font-bold uppercase tracking-wider hover:bg-sage-600 transition-colors shadow-lg"
                >
                  Conclude Trace
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
