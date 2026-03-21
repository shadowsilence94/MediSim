import { useEffect, useState } from "react";
import { Users, Save, Clock, CheckCircle, XCircle, ShieldCheck } from "lucide-react";
import { apiGet, apiPostForm, apiPost } from "../lib/api";

type Role = "admin" | "physician" | "patient";

interface ManagedUser {
  email: string;
  display_name: string;
  role: Role;
  can_use_general_api: boolean;
  has_personal_api_key: boolean;
}

interface UsersResponse {
  status: string;
  users: ManagedUser[];
}

interface ApiRequestItem {
  email: string;
  created_at: string;
}

interface ApiRequestsResponse {
  status: string;
  requests: ApiRequestItem[];
}

export default function AppManagementView() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, Role>>({});

  const [pendingRequests, setPendingRequests] = useState<ApiRequestItem[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<ManagedUser[]>([]);
  const [generalApiKey, setGeneralApiKey] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [userData, reqs] = await Promise.all([
        apiGet<UsersResponse>("/admin/users?limit=300"),
        apiGet<ApiRequestsResponse>("/admin/api-requests"),
      ]);

      const usersList = userData.users || [];
      setUsers(usersList);
      
      const nextDrafts: Record<string, Role> = {};
      for (const u of usersList) {
        nextDrafts[u.email] = u.role;
      }
      setRoleDrafts(nextDrafts);

      setPendingRequests(reqs.requests || []);
      setApprovedUsers(usersList.filter(u => u.can_use_general_api));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load management overview.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const saveAllRoles = async () => {
    setError("");
    setMessage("");
    setSaving(true);
    try {
      await apiPost("/admin/users/roles/bulk", { roles: roleDrafts });
      setMessage("Successfully executed bulk role updates.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update roles.");
    } finally {
      setSaving(false);
    }
  };

  const saveGeneralKey = async () => {
    if (!generalApiKey.trim()) {
      setError("Please enter general API key.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("api_key", generalApiKey.trim());
      await apiPostForm("/settings/general-api-key", formData);
      setMessage("General API key installed on system globally.");
      setGeneralApiKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update general key.");
    } finally {
      setSaving(false);
    }
  };

  const updateUserAccess = async (targetUserEmail: string, grant: boolean) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("target_email", targetUserEmail);
      formData.append("can_use_general_api", String(grant));
      await apiPostForm("/settings/general-api-access", formData);
      setMessage(`Successfully updated API privileges for ${targetUserEmail}.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user access.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-8 py-12">
        <div className="text-sage-500 font-bold uppercase tracking-widest text-xs">
          Loading Application Infrastructure...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-8 py-12 space-y-8 animate-fade-in">
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-[0.3em] text-sage-500 font-bold flex items-center gap-2">
          <ShieldCheck size={14} /> Master Infrastructure
        </div>
        <h2 className="text-4xl font-black tracking-tight text-sage-900 dark:text-sage-50 uppercase">
          App Management
        </h2>
      </div>

      {message && (
        <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-700 font-medium">
          {message}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 text-red-600 font-medium">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="p-6 rounded-3xl bg-white/40 dark:bg-white/5 border border-black/10 dark:border-white/10 space-y-4 shadow-sm relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-sage-500/10 blur-[50px] rounded-full pointer-events-none" />
          
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-2 text-sage-700 dark:text-sage-300 font-bold uppercase text-xs tracking-wider">
              <Users size={16} /> User Roles Config
            </div>
            <button
              onClick={saveAllRoles}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sage-900 dark:bg-sage-700 text-white text-[10px] font-black uppercase tracking-wider shadow-xl hover:bg-sage-600 transition-colors disabled:opacity-50"
            >
              <Save size={14} /> Save Roles Matrix
            </button>
          </div>
          
          <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar relative z-10 pr-2">
            {users.map((u) => (
              <div
                key={u.email}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border border-black/5 dark:border-white/5 bg-white/60 dark:bg-black/20 gap-3"
              >
                <div className="flex items-center gap-3 w-full sm:w-auto overflow-hidden">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-sage-900 dark:text-sage-100 truncate">
                      {u.email}
                    </div>
                    <div className="text-[10px] uppercase font-black tracking-widest mt-1">
                       <span className={u.can_use_general_api ? "text-emerald-500" : "text-amber-500/50"}>
                          General API: {u.can_use_general_api ? "Granted" : "Denied"}
                       </span>
                    </div>
                  </div>
                </div>
                <div className="shrink-0 flex items-center justify-end w-full sm:w-auto">
                   <select
                     value={roleDrafts[u.email] || u.role}
                     onChange={(e) =>
                       setRoleDrafts((prev) => ({
                         ...prev,
                         [u.email]: e.target.value as Role,
                       }))
                     }
                     className="p-2 px-4 text-xs font-bold rounded-xl bg-white dark:bg-black/40 border border-black/10 dark:border-white/10 outline-none focus:ring-2 focus:ring-sage-500/20 text-sage-800 dark:text-sage-200 shadow-inner"
                   >
                     <option value="patient">Patient</option>
                     <option value="physician">Physician</option>
                     <option value="admin">Admin</option>
                   </select>
                </div>
              </div>
            ))}
            {users.length === 0 && (
              <div className="py-6 text-center text-xs font-medium text-sage-500/50 uppercase tracking-widest italic">
                No users found.
              </div>
            )}
          </div>
        </section>

        <section className="space-y-6">
          <div className="p-6 rounded-3xl bg-white/40 dark:bg-white/5 border border-black/10 dark:border-white/10 space-y-4 shadow-sm">
            <h3 className="font-black uppercase tracking-wider text-sage-700 dark:text-sage-300">
              General API Key Identity
            </h3>
            <p className="text-sm text-sage-600 dark:text-sage-400 font-medium">
              Assign the master Google Gemini API key to allow approved normal users to utilize backend inference clusters without burning their personal tokens.
            </p>
            <input
              type="password"
              placeholder="Set new core general API key..."
              value={generalApiKey}
              onChange={(e) => setGeneralApiKey(e.target.value)}
              className="w-full p-4 rounded-xl bg-white/70 dark:bg-black/20 border border-black/10 dark:border-white/10 text-sm font-medium outline-none focus:ring-2 focus:ring-sage-500/40"
            />
            <button
              onClick={saveGeneralKey}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-sage-800 dark:bg-sage-700 text-white text-[11px] font-black uppercase tracking-wider hover:bg-sage-600 transition-colors disabled:opacity-50"
            >
              <Save size={14} /> Update Core Identifier
            </button>
          </div>

          <div className="p-6 rounded-3xl bg-white/40 dark:bg-white/5 border border-black/10 dark:border-white/10 space-y-4 shadow-sm">
            <h3 className="font-black uppercase tracking-wider text-sage-700 dark:text-sage-300">
              API Access Orchestration
            </h3>
            
            {pendingRequests.length === 0 && approvedUsers.length === 0 && (
              <div className="py-6 text-center text-xs font-medium text-sage-500/50 uppercase tracking-widest italic">
                No API requests or active network keys detected.
              </div>
            )}
            
            {pendingRequests.length > 0 && (
              <div className="mb-6 space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-sage-500 mb-2 flex items-center gap-2">
                  <Clock size={12} /> Pending API Network Requests
                </div>
                {pendingRequests.map((req) => (
                  <div key={req.email} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 gap-3 shadow-inner">
                     <div className="text-sm font-bold text-amber-900 dark:text-amber-200 truncate">{req.email}</div>
                     <button
                       onClick={() => updateUserAccess(req.email, true)}
                       disabled={saving}
                       className="inline-flex shrink-0 items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-600/90 text-white text-[10px] font-black uppercase tracking-wider hover:bg-amber-500 transition-colors shadow-lg disabled:opacity-50"
                     >
                       <CheckCircle size={14} /> Approve Access
                     </button>
                  </div>
                ))}
              </div>
            )}

            {approvedUsers.length > 0 && (
              <div className="mb-4 space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-sage-500 mb-2 flex items-center gap-2 mt-6 pt-6 border-t border-black/5 dark:border-white/5">
                  <Users size={12} /> Approved API Key Cluster
                </div>
                {approvedUsers.map((u) => (
                  <div key={u.email} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-2xl bg-white/60 dark:bg-black/20 border border-black/5 dark:border-white/5 gap-3">
                     <div className="text-sm font-bold text-sage-800 dark:text-sage-200 truncate">{u.email}</div>
                     <button
                       onClick={() => updateUserAccess(u.email, false)}
                       disabled={saving}
                       className="inline-flex shrink-0 items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 hover:bg-red-500 hover:text-white transition-colors text-[10px] font-black uppercase tracking-wider disabled:opacity-50"
                     >
                       <XCircle size={14} /> Revoke Node
                     </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

    </div>
  );
}
