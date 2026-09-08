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
  // Browser network errors ("Failed to fetch", "NetworkError", "Load failed")
  // are implementation details too - the owner just needs a kind retry prompt.
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network error") ||
    lower.includes("load failed")
  ) {
    return GENERIC;
  }
  return s;
}
