const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');

function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
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

  return res.json();
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
