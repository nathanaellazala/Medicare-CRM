import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// The app's Layout uses <main class="overflow-y-auto"> as its scroll container.
function getScrollEl() {
  return document.querySelector("main") || document.scrollingElement || document.documentElement;
}

/**
 * Preserve list scroll position across a POP navigation (browser Back).
 *
 * Save: throttled listener on the container's `scroll` event so the latest
 * scrollTop is already in sessionStorage before the user opens a row.
 * Restore: on POP, once `ready` is true, set el.scrollTop via two RAFs so the
 * list has finished measuring.
 */
export function useScrollRestore(namespace, ready) {
  const location = useLocation();
  const navType = useNavigationType();
  const key = `scroll:${namespace}:${location.pathname}${location.search || ""}`;
  const restored = useRef(false);

  // Kill native scroll restoration
  useEffect(() => {
    const prev = window.history.scrollRestoration;
    if (prev !== "manual") window.history.scrollRestoration = "manual";
    return () => { window.history.scrollRestoration = prev || "auto"; };
  }, []);

  // Continuously persist scroll position (throttled). Unmount cleanup cannot
  // read scrollTop reliably because React has already swapped in the detail
  // page and the browser has clamped scrollTop.
  useEffect(() => {
    const el = getScrollEl();
    if (!el) return;
    let raf = null;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        sessionStorage.setItem(key, String(el.scrollTop || 0));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    sessionStorage.setItem(key, String(el.scrollTop || 0));
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [key]);

  // Restore on POP once ready. Try twice, since some rows may lazy-measure.
  useEffect(() => {
    if (restored.current || !ready) return;
    if (navType !== "POP") { restored.current = true; return; }
    const saved = sessionStorage.getItem(key);
    if (saved == null) { restored.current = true; return; }
    const top = Number(saved);
    const applyOnce = () => {
      const el = getScrollEl();
      if (el) el.scrollTop = top;
    };
    requestAnimationFrame(() => requestAnimationFrame(() => {
      applyOnce();
      // Second pass 80ms later in case content grows after render
      setTimeout(applyOnce, 80);
      restored.current = true;
    }));
  }, [ready, navType, key]);
}

/**
 * Cache a list view's data (items + counters) per route so returning via
 * browser Back paints the list instantly — no loading flicker, no scroll
 * collapse. The cache lives in sessionStorage and is scoped by namespace
 * and current URL (pathname + search) so different filter combos each
 * get their own snapshot.
 *
 * Returns { getCached(), setCached(payload) }.
 */
export function useListCache(namespace) {
  const location = useLocation();
  const key = `listcache:${namespace}:${location.pathname}${location.search || ""}`;
  return {
    getCached: () => {
      try {
        const raw = sessionStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    },
    setCached: (payload) => {
      try { sessionStorage.setItem(key, JSON.stringify(payload)); } catch { /* quota — ignore */ }
    },
  };
}
