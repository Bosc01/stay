export const PROFILE_SESSION_IDS_KEY = "stay_triage_session_ids";

export function rememberProfileSession(sessionId) {
  if (!sessionId || typeof sessionId !== "string") return;
  try {
    const raw = localStorage.getItem(PROFILE_SESSION_IDS_KEY);
    const prev = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(prev)) return;
    const next = [sessionId, ...prev.filter((id) => id !== sessionId)];
    localStorage.setItem(PROFILE_SESSION_IDS_KEY, JSON.stringify(next.slice(0, 50)));
  } catch {
    /* ignore corrupt storage */
  }
}

export function getProfileSessionIds() {
  try {
    const raw = localStorage.getItem(PROFILE_SESSION_IDS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((id) => typeof id === "string" && id) : [];
  } catch {
    return [];
  }
}
