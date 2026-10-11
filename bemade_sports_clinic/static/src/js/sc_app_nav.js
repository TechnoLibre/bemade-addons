/*
 * Task 1579 (epic #1535) — app shell: « back » = where you came from.
 *
 * The server renders the back chevron with the RESOLVED parent as its href
 * (models/sc_app_nav.py): that is where a deep link, a shared link, a fresh
 * PWA launch or a reload goes back to. This script keeps, per browser tab
 * (sessionStorage), a stack of the in-app pages visited, and turns the back
 * chevron into history.back() when the previous entry of THIS tab is an
 * in-app page — so back returns to the dashboard, the team, the clinic or the
 * filtered list you actually came from.
 *
 * A page's identity is its path + its « …id » query args: the view state
 * (?tab=, filters, ?success= flashes) is not « another page », and a form
 * POST that redirects back to the same page adds one more history entry for
 * it (counted, so back skips them all). Inert outside .o_sc_app.
 */

const STORE_KEY = "sc_nav_stack:v1";
const POST_KEY = "sc_nav_post:v1";
const UP_KEY = "sc_nav_up:v1";
const MAX_DEPTH = 50;

function storage() {
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}

function load() {
    const store = storage();
    if (!store) {
        return [];
    }
    try {
        const stack = JSON.parse(store.getItem(STORE_KEY) || "[]");
        return Array.isArray(stack) ? stack.filter((entry) => entry && entry.u) : [];
    } catch {
        return [];
    }
}

function save(stack) {
    const store = storage();
    if (!store) {
        return;
    }
    try {
        store.setItem(STORE_KEY, JSON.stringify(stack.slice(-MAX_DEPTH)));
    } catch {
        // quota / private mode: back falls back to the server parent
    }
}

function takeFlag(name) {
    const store = storage();
    if (!store) {
        return false;
    }
    try {
        const flag = store.getItem(name) === "1";
        store.removeItem(name);
        return flag;
    } catch {
        return false;
    }
}

function setFlag(name) {
    const store = storage();
    try {
        store && store.setItem(name, "1");
    } catch {
        // ignore
    }
}

/** path + sorted « …id » query args of a same-origin URL ("" otherwise). */
export function pageKey(url) {
    let parsed;
    try {
        parsed = new URL(url, window.location.origin);
    } catch {
        return "";
    }
    if (parsed.origin !== window.location.origin) {
        return "";
    }
    const ids = [];
    for (const [key, value] of parsed.searchParams) {
        if (key.endsWith("id")) {
            ids.push(`${key}=${value}`);
        }
    }
    ids.sort();
    return parsed.pathname + (ids.length ? "?" + ids.join("&") : "");
}

function currentUrl() {
    return window.location.pathname + window.location.search;
}

function navigationType() {
    try {
        const entry = performance.getEntriesByType("navigation")[0];
        return (entry && entry.type) || "navigate";
    } catch {
        return "navigate";
    }
}

/**
 * Update the tab's stack for the page just shown. ``type`` is the
 * navigation type (navigate | reload | back_forward).
 */
export function syncStack(type) {
    const url = currentUrl();
    const key = pageKey(url);
    const posted = takeFlag(POST_KEY);
    const wentUp = takeFlag(UP_KEY);
    let stack = load();
    const top = stack[stack.length - 1];
    if (type === "reload") {
        // A reload falls back to the declared parent (owner decision).
        stack = [{ u: url, k: key, n: 1 }];
    } else if (type === "back_forward") {
        let index = -1;
        for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i].k === key) {
                index = i;
                break;
            }
        }
        if (index === -1) {
            stack = [{ u: url, k: key, n: 1 }];
        } else if (index === stack.length - 1) {
            // Back within the same page's entries (a POST round-trip).
            top.n = Math.max(1, (top.n || 1) - 1);
            top.u = url;
        } else {
            stack = stack.slice(0, index + 1);
            stack[index].u = url;
        }
    } else {
        // A link / form: in-app only when the page we came from is the top
        // of this tab's stack (referrer); a typed URL, a bookmark, a shared
        // link or a fresh PWA launch has no in-app referrer.
        // A back chevron that fell back to its href went UP to the parent:
        // the page left behind is a child, not where this one came from.
        const from = document.referrer ? pageKey(document.referrer) : "";
        if (wentUp || !top || !from || from !== top.k) {
            stack = [{ u: url, k: key, n: 1 }];
        } else if (top.k === key) {
            // Same page again: a POST round-trip or a view-state link adds a
            // history entry; a link to the very same URL replaces it.
            if (posted || top.u !== url) {
                top.n = (top.n || 1) + 1;
            }
            top.u = url;
        } else {
            stack.push({ u: url, k: key, n: 1 });
        }
    }
    save(stack);
    return stack;
}

/** How many history entries back the previous in-app page is (0 = none). */
export function backDistance() {
    const stack = load();
    if (stack.length < 2) {
        return 0;
    }
    const top = stack[stack.length - 1];
    return top.k === pageKey(currentUrl()) ? top.n || 1 : 0;
}

function inShell() {
    return Boolean(document.querySelector(".o_sc_app[data-sc-app-shell]"));
}

function init() {
    if (!inShell()) {
        return;
    }
    syncStack(navigationType());
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

// Restored from the back/forward cache: the page did not load again.
window.addEventListener("pageshow", (ev) => {
    if (ev.persisted && inShell()) {
        syncStack("back_forward");
    }
});

// The back chevron: history.back() to the previous in-app page of this tab
// (skipping that page's own POST round-trips), else its href — the parent.
document.addEventListener("click", (ev) => {
    const back = ev.target.closest && ev.target.closest(".o_sc_app a[data-sc-back]");
    if (!back || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button) {
        return;
    }
    const distance = backDistance();
    if (distance > 0) {
        ev.preventDefault();
        window.history.go(-distance);
        return;
    }
    // else: the href, i.e. the resolved parent.
    setFlag(UP_KEY);
});

// A form POST in the shell that comes back to the same page adds a history
// entry for it: remember it for the next page load.
document.addEventListener("submit", (ev) => {
    const form = ev.target;
    if (!form || !form.closest || !form.closest(".o_sc_app")) {
        return;
    }
    if ((form.method || "").toLowerCase() !== "post") {
        return;
    }
    // After every listener ran: a fetch-driven form (preventDefault) does
    // not navigate.
    setTimeout(() => {
        if (!ev.defaultPrevented) {
            setFlag(POST_KEY);
        }
    }, 0);
});
