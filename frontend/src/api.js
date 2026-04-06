export async function submitTriage(intake) {
  const res = await fetch("/triage", {
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
  const res = await fetch("/followup", {
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
