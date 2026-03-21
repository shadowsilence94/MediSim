import { useEffect, useMemo, useState } from "react";
import {
  MessageCircle,
  X,
  ShieldCheck,
  UserCheck,
  Trash2,
  Search,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { apiGet, apiPostForm, apiDelete } from "../lib/api";

type Role = "admin" | "physician" | "patient";

interface CareCase {
  id: string;
  user_email: string;
  message: string;
  verified: string;
  status?: string;
}

interface CasesResponse {
  status: string;
  cases: CareCase[];
}

interface CaseMessage {
  id: string;
  sender_email: string;
  sender_role: string;
  message: string;
}

interface CaseMessagesResponse {
  messages: CaseMessage[];
}

export default function GlobalChat({ userRole }: { userRole: Role | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [cases, setCases] = useState<CareCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [messages, setMessages] = useState<CaseMessage[]>([]);
  const [replyText, setReplyText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const isClinician = userRole === "admin" || userRole === "physician";
  const canDeleteMessages = userRole === "admin";

  const filteredCases = useMemo(() => {
    let filtered = cases;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = cases.filter(
        (c) =>
          c.user_email.toLowerCase().includes(query) ||
          c.id.toLowerCase().includes(query) ||
          c.message.toLowerCase().includes(query) ||
          c.verified.toLowerCase().includes(query),
      );
    }

    // Sort by recent first and limit to recent 10 cases
    return filtered.slice(0, 10);
  }, [cases, searchQuery]);

  const groupedCases = useMemo(() => {
    const grouped = new Map<
      string,
      { user_email: string; cases: CareCase[]; solved: number; open: number }
    >();

    for (const c of filteredCases) {
      const existing = grouped.get(c.user_email) || {
        user_email: c.user_email,
        cases: [],
        solved: 0,
        open: 0,
      };
      existing.cases.push(c);
      if ((c.status || "pending") === "settled") {
        existing.solved += 1;
      } else {
        existing.open += 1;
      }
      grouped.set(c.user_email, existing);
    }

    return [...grouped.values()].sort(
      (a, b) => b.cases.length - a.cases.length,
    );
  }, [filteredCases]);

  const selectedCase = useMemo(
    () => cases.find((c) => c.id === selectedCaseId) || null,
    [cases, selectedCaseId],
  );

  const groupedMessages = useMemo(() => {
    const groups: Array<{
      key: string;
      sender_email: string;
      sender_role: string;
      items: CaseMessage[];
    }> = [];

    for (const m of messages) {
      const last = groups[groups.length - 1];
      if (
        last &&
        last.sender_email === m.sender_email &&
        last.sender_role === m.sender_role
      ) {
        last.items.push(m);
      } else {
        groups.push({
          key: `${m.id}-${groups.length}`,
          sender_email: m.sender_email,
          sender_role: m.sender_role,
          items: [m],
        });
      }
    }

    return groups;
  }, [messages]);

  useEffect(() => {
    if (isOpen && userRole) {
      const endpoint = isClinician
        ? "/care/cases?limit=50"
        : "/care/my-cases?limit=20";
      apiGet<CasesResponse>(endpoint)
        .then((res) => {
          setCases(res.cases || []);
          if (!res.cases?.length) {
            setSelectedCaseId("");
            return;
          }
          const hasSelected = res.cases.some((c) => c.id === selectedCaseId);
          if (!selectedCaseId || !hasSelected) {
            setSelectedCaseId(res.cases[0].id);
          }
        })
        .catch(() => setCases([]));
    }
  }, [isOpen, userRole, isClinician, selectedCaseId]);

  useEffect(() => {
    if (isOpen && selectedCaseId) {
      apiGet<CaseMessagesResponse>(`/care/cases/${selectedCaseId}/messages`)
        .then((res) => setMessages(res.messages || []))
        .catch(() => setMessages([]));
    }
  }, [isOpen, selectedCaseId]);

  const sendReply = async () => {
    if (!selectedCaseId || !replyText.trim()) return;
    try {
      const formData = new FormData();
      formData.append("message", replyText.trim());
      await apiPostForm(`/care/cases/${selectedCaseId}/messages`, formData);
      setReplyText("");
      const res = await apiGet<CaseMessagesResponse>(
        `/care/cases/${selectedCaseId}/messages`,
      );
      setMessages(res.messages || []);
    } catch (err) {
      console.error("Failed to post message", err);
    }
  };

  const deleteMessage = async (msgId: string) => {
    if (!canDeleteMessages) return;
    if (!selectedCaseId || !confirm("Delete this message?")) return;
    try {
      await apiDelete(`/care/cases/${selectedCaseId}/messages/${msgId}`);
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    } catch (err) {
      console.error("Failed to delete message", err);
    }
  };

  if (!userRole) return null;

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 p-4 bg-sage-900 dark:bg-sage-600 text-white rounded-full shadow-2xl hover:scale-110 transition-transform flex items-center justify-center z-[9990] group hover:shadow-sage-500/50"
        >
          <MessageCircle
            size={24}
            className="group-hover:rotate-12 transition-transform"
          />
        </button>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            className="fixed bottom-6 right-6 w-96 max-w-[calc(100vw-2rem)] bg-white/95 dark:bg-black/95 backdrop-blur-3xl border border-black/10 dark:border-white/10 rounded-[2rem] shadow-2xl z-[9999] overflow-hidden flex flex-col max-h-[600px]"
          >
            <div className="p-4 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-sage-50 dark:bg-sage-900/20">
              <div className="text-[10px] font-bold uppercase tracking-widest text-sage-500 flex items-center gap-2">
                {isClinician ? (
                  <ShieldCheck size={14} />
                ) : (
                  <UserCheck size={14} />
                )}
                {isClinician ? "Care Ops Communications" : "Physician Thread"}
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <X size={16} className="text-sage-700 dark:text-sage-300" />
              </button>
            </div>

            <div className="p-6 flex-grow overflow-y-auto space-y-4 custom-scrollbar">
              {isClinician && groupedCases.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-sage-500">
                    Active Cases ({filteredCases.length}/{cases.length})
                  </div>
                  <div className="glass flex items-center px-3 py-2.5 gap-2 border-black/5 dark:border-white/5 rounded-xl focus-within:ring-2 focus-within:ring-sage-500/20 transition-all">
                    <Search size={14} className="text-sage-500 opacity-60" />
                    <input
                      type="text"
                      placeholder="Search user, case ID, message..."
                      className="bg-transparent border-none outline-none text-[10px] font-light text-sage-900 dark:text-sage-100 placeholder:text-sage-600 dark:placeholder:text-sage-400 w-full"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 max-h-28 overflow-auto custom-scrollbar pr-1">
                    {groupedCases.map((group) => (
                      <div
                        key={group.user_email}
                        className="p-2.5 rounded-xl bg-sage-500/5 border border-sage-500/15"
                      >
                        <div className="text-[10px] font-black text-sage-800 dark:text-sage-100 truncate">
                          {group.user_email}
                        </div>
                        <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-sage-600 dark:text-sage-400 flex flex-wrap gap-2">
                          <span>Total {group.cases.length}</span>
                          <span className="text-emerald-600">
                            Solved {group.solved}
                          </span>
                          <span className="text-amber-600">
                            Open {group.open}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!isClinician && searchQuery && (
                <div className="glass flex items-center px-3 py-2.5 gap-2 border-black/5 dark:border-white/5 rounded-xl focus-within:ring-2 focus-within:ring-sage-500/20 transition-all">
                  <Search size={14} className="text-sage-500 opacity-60" />
                  <input
                    type="text"
                    placeholder="Search case ID or message..."
                    className="bg-transparent border-none outline-none text-[10px] font-light text-sage-900 dark:text-sage-100 placeholder:text-sage-600 dark:placeholder:text-sage-400 w-full"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              )}

              <select
                value={selectedCaseId}
                onChange={(e) => setSelectedCaseId(e.target.value)}
                className="w-full p-2.5 text-xs font-medium rounded-xl bg-sage-500/10 border border-sage-500/20 outline-none focus:ring-2 focus:ring-sage-500/40 transition-all text-sage-900 dark:text-sage-100"
              >
                <option value="">Select a triage case...</option>
                {isClinician
                  ? groupedCases.map((group) => (
                      <optgroup
                        key={group.user_email}
                        label={`${group.user_email} (${group.cases.length})`}
                      >
                        {group.cases.map((c, index) => (
                          <option key={c.id} value={c.id}>
                            {`#${index + 1} ${c.id.slice(0, 8)} - ${c.message.slice(0, 28)}`}
                          </option>
                        ))}
                      </optgroup>
                    ))
                  : filteredCases.map((c) => (
                      <option key={c.id} value={c.id}>
                        {`${c.id.slice(0, 8)} - ${c.message.slice(0, 30)}`}
                      </option>
                    ))}
              </select>

              {selectedCase && isClinician && (
                <div className="p-2.5 rounded-xl bg-white/60 dark:bg-white/5 border border-black/5 dark:border-white/5 text-[10px] font-bold uppercase tracking-wider text-sage-600 dark:text-sage-300">
                  <div className="truncate">
                    User: {selectedCase.user_email}
                  </div>
                  <div className="mt-1">
                    Status: {selectedCase.status || "pending"}
                  </div>
                </div>
              )}

              <div className="flex-grow overflow-auto space-y-3">
                {messages.length === 0 && selectedCaseId && (
                  <div className="text-center text-[10px] uppercase font-bold tracking-widest text-sage-500/50 py-10 italic">
                    No interactions recorded
                  </div>
                )}
                {groupedMessages.map((group) => (
                  <div
                    key={group.key}
                    className="p-3 rounded-xl bg-white/60 dark:bg-white/5 border border-black/5 dark:border-white/5 shadow-sm group/msg relative"
                  >
                    <div className="text-[9px] font-black uppercase tracking-wider text-sage-600 dark:text-sage-400 mb-1">
                      {group.sender_role}{" "}
                      <span className="opacity-50">| {group.sender_email}</span>
                    </div>
                    <div className="space-y-2 pr-6">
                      {group.items.map((m, idx) => (
                        <div
                          key={m.id}
                          className="text-xs font-medium text-sage-800 dark:text-sage-200 leading-relaxed"
                        >
                          {group.items.length > 1 ? (
                            <span className="text-sage-500 font-black mr-1.5">
                              {idx + 1}.
                            </span>
                          ) : null}
                          {m.message}
                        </div>
                      ))}
                    </div>
                    {canDeleteMessages && group.items.length > 0 && (
                      <button
                        onClick={() =>
                          deleteMessage(group.items[group.items.length - 1].id)
                        }
                        className="absolute top-2 right-2 p-1.5 text-red-500 opacity-0 group-hover/msg:opacity-100 hover:bg-red-500 hover:text-white rounded-lg transition-all"
                        title="Delete latest message in this grouped block"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 border-t border-black/5 dark:border-white/5 bg-gray-50/50 dark:bg-gray-900/50 space-y-3">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={2}
                placeholder={
                  isClinician
                    ? "Dispatch directive to patient..."
                    : "Consult physician or admin..."
                }
                className="w-full p-3 text-xs placeholder:italic rounded-xl bg-white dark:bg-black/20 border border-black/10 dark:border-white/10 outline-none focus:ring-2 focus:ring-sage-500/40 transition-all text-sage-900 dark:text-sage-100 resize-none"
              />
              <button
                onClick={sendReply}
                disabled={!replyText.trim() || !selectedCaseId}
                className="w-full px-4 py-2.5 rounded-xl bg-sage-800 text-white text-[10px] font-black uppercase tracking-wider hover:bg-sage-700 transition-colors disabled:opacity-30 disabled:hover:bg-sage-800"
              >
                Send Secure Message
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
