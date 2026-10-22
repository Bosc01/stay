/**
 * Shared admin gate storage, used by the dashboard and the outreach queue.
 * The password itself is never in the bundle: the backend checks it.
 */

const SESSION_STORAGE_KEY = "stay_admin_password";

export function loadStoredPassword() {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function savePassword(pw) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, pw);
  } catch {
    /* ignore */
  }
}

export function clearStoredPassword() {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
