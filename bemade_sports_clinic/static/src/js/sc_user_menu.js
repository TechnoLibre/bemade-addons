/*
 * Task 1606 — the app shell's user menu (« Paramètres », « Se déconnecter »).
 *
 * Two triggers, one per width: the rail footer (name + initials, laptop) and
 * the initials avatar at the right of the app bar (phone). Each is a
 * button[data-sc-user-menu-toggle][aria-haspopup="menu"] whose aria-controls
 * names its popup ([data-sc-user-menu-popup], rendered hidden).
 *
 * - tap / Enter / Space toggles; ArrowDown / ArrowUp on the trigger open it
 *   on the first / last item;
 * - in the menu: ArrowDown / ArrowUp (wrapping), Home / End move the focus;
 *   Escape closes and gives the focus back to the trigger; Tab closes;
 * - a tap outside closes it; opening one closes the other.
 *
 * The items are plain links: « Se déconnecter » keeps the logout route (and
 * sc_app_ui.js still clears the device drafts on it). Inert outside .o_sc_app.
 */

function popupOf(toggle) {
    const id = toggle.getAttribute("aria-controls");
    return id ? document.getElementById(id) : null;
}

function itemsOf(popup) {
    return [...popup.querySelectorAll('[role="menuitem"]')];
}

function close(toggle, { focus = false } = {}) {
    const popup = popupOf(toggle);
    if (popup) {
        popup.hidden = true;
    }
    toggle.setAttribute("aria-expanded", "false");
    if (focus) {
        toggle.focus();
    }
}

function closeAll(except) {
    for (const toggle of document.querySelectorAll(
        '.o_sc_app [data-sc-user-menu-toggle][aria-expanded="true"]'
    )) {
        if (toggle !== except) {
            close(toggle);
        }
    }
}

function open(toggle, which = "first") {
    const popup = popupOf(toggle);
    if (!popup) {
        return;
    }
    closeAll(toggle);
    popup.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    const items = itemsOf(popup);
    const target = which === "last" ? items[items.length - 1] : items[0];
    if (target) {
        target.focus();
    }
}

function toggleOf(el) {
    const popup = el.closest("[data-sc-user-menu-popup]");
    return popup
        ? document.querySelector(`[data-sc-user-menu-toggle][aria-controls="${popup.id}"]`)
        : null;
}

document.addEventListener("click", (ev) => {
    if (!ev.target.closest || !ev.target.closest(".o_sc_app")) {
        closeAll();
        return;
    }
    const toggle = ev.target.closest("[data-sc-user-menu-toggle]");
    if (toggle) {
        if (toggle.getAttribute("aria-expanded") === "true") {
            close(toggle);
        } else {
            open(toggle);
        }
        return;
    }
    const item = ev.target.closest('[data-sc-user-menu-popup] [role="menuitem"]');
    if (item) {
        return; // the link navigates
    }
    if (!ev.target.closest("[data-sc-user-menu-popup]")) {
        closeAll();
    }
});

document.addEventListener("keydown", (ev) => {
    const target = ev.target;
    if (!target || !target.closest) {
        return;
    }
    const toggle = target.closest(".o_sc_app [data-sc-user-menu-toggle]");
    if (toggle) {
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
            ev.preventDefault();
            open(toggle, ev.key === "ArrowUp" ? "last" : "first");
        } else if (ev.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
            ev.preventDefault();
            close(toggle, { focus: true });
        }
        return;
    }
    const item = target.closest('.o_sc_app [data-sc-user-menu-popup] [role="menuitem"]');
    if (!item) {
        return;
    }
    const owner = toggleOf(item);
    if (!owner) {
        return;
    }
    const items = itemsOf(item.closest("[data-sc-user-menu-popup]"));
    const index = items.indexOf(item);
    let next = null;
    switch (ev.key) {
        case "ArrowDown":
            next = items[(index + 1) % items.length];
            break;
        case "ArrowUp":
            next = items[(index - 1 + items.length) % items.length];
            break;
        case "Home":
            next = items[0];
            break;
        case "End":
            next = items[items.length - 1];
            break;
        case "Escape":
            ev.preventDefault();
            close(owner, { focus: true });
            return;
        case "Tab":
            close(owner);
            return;
        case " ":
            ev.preventDefault();
            item.click();
            return;
        default:
            return;
    }
    ev.preventDefault();
    if (next) {
        next.focus();
    }
});

// Crossing the laptop width (rotation, window resize) swaps the visible
// trigger: never leave the hidden one's popup open. (Not on every resize:
// a phone's toolbar collapsing on scroll fires those.)
const laptop = window.matchMedia && window.matchMedia("(min-width: 992px)");
if (laptop && laptop.addEventListener) {
    laptop.addEventListener("change", () => closeAll());
}
// Back / forward cache: a restored page shows the menu closed.
window.addEventListener("pageshow", () => closeAll());
