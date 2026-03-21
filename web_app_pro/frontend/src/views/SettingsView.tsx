import { useEffect, useState, type ReactNode } from "react";
import { Settings, ShieldCheck, KeyRound, UserCheck, Save } from "lucide-react";
import { apiGet, apiPostForm, apiPost } from "../lib/api";

interface EmrProfile {
  display_name: string;
  sex: string;
  age: number | null;
  allergies: string[];
  current_medications: string[];
  medication_dosage: string;
}

interface UserProfileResponse {
  status: string;
  profile: {
    email: string;
    is_admin: boolean;
    can_use_general_api: boolean;
    has_personal_api_key: boolean;
    emr?: EmrProfile;
  };
}

interface EmrNote {
  id: string;
  title: string;
  source_type: string;
  ocr_status: string;
  ocr_text_preview: string;
  created_at: string;
}

interface EmrNotesResponse {
  status: string;
  notes: EmrNote[];
}

export default function SettingsView() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [canUseGeneralApi, setCanUseGeneralApi] = useState(false);
  const [hasPersonalKey, setHasPersonalKey] = useState(false);

  const [personalApiKey, setPersonalApiKey] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [sex, setSex] = useState("");
  const [age, setAge] = useState("");
  const [allergies, setAllergies] = useState("");
  const [currentMeds, setCurrentMeds] = useState("");
  const [medicationDosage, setMedicationDosage] = useState("");

  const [noteTitle, setNoteTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteFile, setNoteFile] = useState<File | null>(null);
  const [notes, setNotes] = useState<EmrNote[]>([]);

  const loadProfile = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiGet<UserProfileResponse>("/me");
      setEmail(data.profile.email);
      setIsAdmin(data.profile.is_admin);
      setCanUseGeneralApi(data.profile.can_use_general_api);
      setHasPersonalKey(data.profile.has_personal_api_key);
      const emr = data.profile.emr;
      if (emr) {
        setDisplayName(emr.display_name || "");
        setSex(emr.sex || "");
        setAge(
          emr.age === null || emr.age === undefined ? "" : String(emr.age),
        );
        setAllergies((emr.allergies || []).join(", "));
        setCurrentMeds((emr.current_medications || []).join(", "));
        setMedicationDosage(emr.medication_dosage || "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const loadNotes = async () => {
    try {
      const data = await apiGet<EmrNotesResponse>("/emr/notes?limit=20");
      setNotes(data.notes || []);
    } catch {
      setNotes([]);
    }
  };

  useEffect(() => {
    void loadProfile();
    void loadNotes();
  }, []);

  const savePersonalKey = async () => {
    if (!personalApiKey.trim()) {
      setError("Please enter your personal API key.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("api_key", personalApiKey.trim());
      await apiPostForm("/settings/personal-api-key", formData);
      setMessage("Personal API key saved.");
      setHasPersonalKey(true);
      setPersonalApiKey("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save personal key",
      );
    } finally {
      setSaving(false);
    }
  };

  const requestGeneralApi = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiPost("/settings/request-general-api", {});
      setMessage("API Key access request submitted. An admin will review it shortly.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to request API access",
      );
    } finally {
      setSaving(false);
    }
  };

  const saveEmrProfile = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("display_name", displayName.trim());
      formData.append("sex", sex.trim());
      formData.append("age", age.trim());
      formData.append("allergies", allergies.trim());
      formData.append("current_medications", currentMeds.trim());
      formData.append("medication_dosage", medicationDosage.trim());
      await apiPostForm("/emr/profile", formData);
      setMessage("EMR profile saved.");
      await loadProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save EMR");
    } finally {
      setSaving(false);
    }
  };

  const saveEmrNote = async () => {
    if (!noteText.trim() && !noteFile) {
      setError("Add note text or upload a physician note file.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("title", noteTitle.trim());
      formData.append("ocr_text", noteText.trim());
      if (noteFile) {
        formData.append("note_file", noteFile);
      }
      await apiPostForm("/emr/notes", formData);
      setMessage("Physician note saved. OCR pipeline can be attached next.");
      setNoteTitle("");
      setNoteText("");
      setNoteFile(null);
      await loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-8 py-12">
        <div className="p-8 rounded-3xl bg-white/40 dark:bg-white/5 border border-black/5 dark:border-white/10">
          Loading settings...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-8 py-12 space-y-8 animate-fade-in">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sage-500">
          <Settings size={16} />
          <span className="text-[10px] font-bold uppercase tracking-[0.3em]">
            Role-aware Settings
          </span>
        </div>
        <h2 className="text-4xl font-black tracking-tight text-sage-900 dark:text-sage-50 uppercase">
          Access & API Control
        </h2>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <StatusCard
          title="Signed-in User"
          value={email || "-"}
          icon={<ShieldCheck size={16} />}
        />
        <StatusCard
          title="Role"
          value={isAdmin ? "Admin" : "Normal User"}
          icon={<UserCheck size={16} />}
        />
        <StatusCard
          title="Personal API"
          value={hasPersonalKey ? "Configured" : "Not Set"}
          icon={<KeyRound size={16} />}
        />
      </div>

      <div className="p-6 rounded-3xl bg-white/40 dark:bg-white/5 border border-black/5 dark:border-white/10 space-y-4">
        <h3 className="font-black uppercase tracking-wider text-sage-700 dark:text-sage-300">
          Patient EMR Profile
        </h3>
        <p className="text-sm text-sage-600 dark:text-sage-400">
          Each user account stores a separate EMR profile used by triage
          context.
        </p>
        <div className="grid md:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Clinical Display Name (used by agents)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full md:col-span-2 p-3 rounded-xl bg-white/70 dark:bg-black/20 border border-black/10 dark:border-white/10"
          />
          <input
            type="text"
            placeholder="Sex"
            value={sex}
            onChange={(e) => setSex(e.target.value)}
            className="w-full p-3 rounded-xl bg-white/70 dark:bg-black/20 border border-black/10 dark:border-white/10"
          />
          <input
            type="number"
            placeholder="Age"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className="w-full p-3 rounded-xl bg-white/70 dark:bg-black/20 border border-black/10 dark:border-white/10"
          />
        </div>
        <input
          type="text"
          placeholder="Allergies (comma-separated)"
          value={allergies}
          onChange={(e) => setAllergies(e.target.value)}
          className="w-full p-3 rounded-xl bg-white/70 dark:bg-black/20 border border-black/10 dark:border-white/10"
        />
        <input
          type="text"
          placeholder="Current medicines (comma-separated)"
          value={currentMeds}
          onChange={(e) => setCurrentMeds(e.target.value)}
          className="w-full p-3 rounded-xl bg-white/70 dark:bg-black/20 border border-black/10 dark:border-white/10"
        />
        <input
          type="text"
          placeholder="Current dosage details"
          value={medicationDosage}
          onChange={(e) => setMedicationDosage(e.target.value)}
          className="w-full p-3 rounded-xl bg-white/70 dark:bg-black/20 border border-black/10 dark:border-white/10"
        />
        <button
          onClick={saveEmrProfile}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sage-700 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50"
        >
          <Save size={14} /> Save EMR
        </button>
      </div>

      <div className="p-6 rounded-3xl bg-white/40 dark:bg-white/5 border border-black/5 dark:border-white/10 space-y-4">
        <h3 className="font-black uppercase tracking-wider text-sage-700 dark:text-sage-300">
          Physician Notes (OCR-ready)
        </h3>
        <p className="text-sm text-sage-600 dark:text-sage-400">
          Upload records now and attach OCR extraction text. Full OCR automation
          can be enabled as a future pipeline.
        </p>
        <input
          type="text"
          placeholder="Note title"
          value={noteTitle}
          onChange={(e) => setNoteTitle(e.target.value)}
          className="w-full p-3 rounded-xl bg-white/70 dark:bg-black/20 border border-black/10 dark:border-white/10"
        />
        <textarea
          placeholder="OCR text or physician note content"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={4}
          className="w-full p-3 rounded-xl bg-white/70 dark:bg-black/20 border border-black/10 dark:border-white/10"
        />
        <input
          type="file"
          onChange={(e) => setNoteFile(e.target.files?.[0] || null)}
          className="w-full p-3 rounded-xl bg-white/70 dark:bg-black/20 border border-black/10 dark:border-white/10"
        />
        <button
          onClick={saveEmrNote}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sage-700 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50"
        >
          <Save size={14} /> Save Note
        </button>
        <div className="space-y-2">
          {notes.map((note) => (
            <div
              key={note.id}
              className="p-3 rounded-xl bg-white/60 dark:bg-black/20 border border-black/10 dark:border-white/10"
            >
              <div className="text-xs font-bold text-sage-800 dark:text-sage-200">
                {note.title || "Physician Note"}
              </div>
              <div className="text-[11px] text-sage-600 dark:text-sage-400">
                {note.ocr_text_preview || "No OCR text yet."}
              </div>
            </div>
          ))}
          {notes.length === 0 && (
            <div className="text-xs text-sage-500">No EMR notes saved yet.</div>
          )}
        </div>
      </div>

      <div className="p-6 rounded-3xl bg-white/40 dark:bg-white/5 border border-black/5 dark:border-white/10 space-y-4">
        <h3 className="font-black uppercase tracking-wider text-sage-700 dark:text-sage-300">
          Personal API Key
        </h3>
        <p className="text-sm text-sage-600 dark:text-sage-400">
          Your personal key always has priority over general key access.
        </p>
        <input
          type="password"
          placeholder="Enter your personal API key"
          value={personalApiKey}
          onChange={(e) => setPersonalApiKey(e.target.value)}
          className="w-full p-3 rounded-xl bg-white/70 dark:bg-black/20 border border-black/10 dark:border-white/10"
        />
        <button
          onClick={savePersonalKey}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sage-700 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50"
        >
          <Save size={14} /> Save Personal Key
        </button>
      </div>

      {!isAdmin && (
        <div className="p-6 rounded-3xl bg-sage-500/10 border border-sage-500/20 space-y-4">
          <div className="text-sm text-sage-700 dark:text-sage-300">
            Your current general API access:{" "}
            <strong>
              {canUseGeneralApi ? "Enabled by Admin" : "Not enabled"}
            </strong>
          </div>
          {!canUseGeneralApi && (
            <button
              onClick={requestGeneralApi}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sage-700 text-white text-xs font-bold uppercase tracking-wider hover:bg-sage-600 transition-colors disabled:opacity-50"
            >
              Request General API Key Access
            </button>
          )}
        </div>
      )}

      {message && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700">
          {message}
        </div>
      )}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600">
          {error}
        </div>
      )}
    </div>
  );
}

function StatusCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/5 border border-black/5 dark:border-white/10">
      <div className="flex items-center gap-2 text-sage-500 mb-2">
        {icon}
        <span className="text-[10px] uppercase tracking-widest font-bold">
          {title}
        </span>
      </div>
      <div className="text-sm font-bold text-sage-900 dark:text-sage-100 break-all">
        {value}
      </div>
    </div>
  );
}
