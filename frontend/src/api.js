const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');

function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
}

export async function fetchRecentStories() {
  const res = await fetch(apiUrl("/stories/recent"));
  if (!res.ok) {
    throw new Error("Stories request failed");
  }
  return res.json();
}

export async function submitTriage(intake) {
  const res = await fetch(apiUrl("/triage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(intake),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Triage request failed");
  }

  const data = await res.json();
  return { ...data, session_id: data?.session_id ?? null };
}

export async function submitFollowup({ session_id, email }) {
  const res = await fetch(apiUrl("/followup"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id, email }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    const msg =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg || d).join(", ")
          : "Follow-up request failed";
    throw new Error(msg);
  }

  return res.json();
}

export async function fetchReferralStats(ref) {
  const q = new URLSearchParams({ ref });
  const res = await fetch(`${apiUrl("/referral-stats")}?${q.toString()}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to load referral stats");
  }

  return res.json();
}

export async function fetchProfileSession(sessionId) {
  const res = await fetch(apiUrl(`/profile/session/${encodeURIComponent(sessionId)}`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to load session");
  }
  return res.json();
}

export async function patchProfileSession(sessionId, body) {
  const res = await fetch(apiUrl(`/profile/session/${encodeURIComponent(sessionId)}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    const msg =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg || d).join(", ")
          : "Update failed";
    throw new Error(msg);
  }
  return res.json();
}

export async function fetchProfileHistory({ session_ids }) {
  const res = await fetch(apiUrl("/profile/history"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_ids }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to load history");
  }
  return res.json();
}

export async function fetchProfileJournal(sessionId) {
  const res = await fetch(apiUrl(`/profile/journal/${encodeURIComponent(sessionId)}`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to load journal");
  }
  return res.json();
}

export async function createJournalEntry({ session_id, body }) {
  const res = await fetch(apiUrl("/profile/journal"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id, body }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    const msg =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg || d).join(", ")
          : "Could not save journal entry";
    throw new Error(msg);
  }
  return res.json();
}
