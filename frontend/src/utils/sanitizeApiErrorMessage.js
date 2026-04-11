const GENERIC = "Something went wrong. Please try again.";

/**
 * Hides implementation details from users when the API surfaces DB/PostgREST errors.
 */
export function sanitizeApiErrorMessage(message) {
  if (message == null || message === "") return message;
  const s = String(message);
  const lower = s.toLowerCase();
  if (lower.includes("database error") || lower.includes("pgrst")) {
    return GENERIC;
  }
  return s;
}
