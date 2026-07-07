import axios from "axios";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND}/api`;

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  }
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

/** Convert an ISO date ("1961-01-22") or datetime string to MM/DD/YYYY.
 *  Returns "" for null/empty. Never throws. */
export function formatBirthdate(s) {
  if (!s) return "";
  const str = String(s).trim();
  if (!str) return "";
  // Strip time portion if present
  const datePart = str.split(/[T\s]/)[0];
  // Match YYYY-MM-DD or YYYY/MM/DD
  const iso = datePart.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${m.padStart(2, "0")}/${d.padStart(2, "0")}/${y}`;
  }
  // Match MM/DD/YYYY already — return as-is (with zero padding)
  const us = datePart.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (us) {
    const [, m, d, y] = us;
    const yy = y.length === 2 ? (parseInt(y, 10) > 30 ? `19${y}` : `20${y}`) : y;
    return `${m.padStart(2, "0")}/${d.padStart(2, "0")}/${yy}`;
  }
  return datePart;
}
