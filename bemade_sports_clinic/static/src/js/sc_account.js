/*
 * Review fixes 2026-10-18 b — « Mon compte » cards (views/sc_app_account.xml,
 * inert outside .o_sc_app): « Contact details » and « Address » are edit
 * cards (pencil → edit view, sc_app_ui.js) inside ONE core address form.
 *
 * - « Save » ([data-sc-account-save], or Enter in a field) of a card posts
 *   the form to the core /my/address/submit with the OTHER card's last
 *   saved values (never its unsaved edits), so the core validation — the
 *   whole address is mandatory — passes. Success: the card's values become
 *   its saved values, the card closes, its read view refreshes (read
 *   fragment, task 1611) and a toast confirms; the page stays. Refusal: the
 *   core messages show in the card's own error box ([data-sc-account-errors])
 *   and the core's invalid fields are flagged (.is-invalid); a flagged field
 *   in the other card adds a hint.
 * - « Cancel » (or the pencil while editing) puts the card's saved values
 *   back (the province list too) and closes it.
 * The core CustomerAddress interaction keeps the country → province reload
 * and the required-field marking; its own #save_address is not rendered.
 */
import { requestRefresh } from "@bemade_sports_clinic/js/sc_fragments";
import { scFetch } from "@bemade_sports_clinic/js/sc_fetch";

const saved = new WeakMap(); // card → {name: value, __states: html, __statesShown}

function accountForm(node) {
    const form = node && node.closest && node.closest("form[data-sc-account-form]");
    return form && form.closest(".o_sc_app") ? form : null;
}

function cards(form) {
    return [...form.querySelectorAll("[data-sc-edit-card^='account-']")];
}

function fieldsOf(card) {
    return [...card.querySelectorAll('[data-sc-edit-view="edit"] [name]')];
}

function snapshot(card) {
    const values = {};
    for (const field of fieldsOf(card)) {
        values[field.name] = field.value;
    }
    const states = card.querySelector('select[name="state_id"]');
    if (states) {
        values.__states = states.innerHTML;
        values.__statesShown = states.parentElement.style.display;
    }
    saved.set(card, values);
    return values;
}

function savedValues(card) {
    return saved.get(card) || snapshot(card);
}

function message(form, key) {
    const node = form.querySelector(`[data-sc-account-msg="${key}"]`);
    return node ? node.textContent.trim() : "";
}

function showErrors(card, messages) {
    const box = card.querySelector("[data-sc-account-errors]");
    if (!box) {
        return;
    }
    box.replaceChildren(
        ...messages.map((text) => {
            const line = document.createElement("h5");
            line.textContent = text;
            return line;
        })
    );
}

function flag(form, invalid) {
    for (const field of form.querySelectorAll(".is-invalid")) {
        if (!invalid.includes(field.name)) {
            field.classList.remove("is-invalid");
            field.removeAttribute("aria-invalid");
        }
    }
    for (const name of invalid) {
        const field = form.elements[name];
        if (field && field.classList) {
            field.classList.add("is-invalid");
            field.setAttribute("aria-invalid", "true");
        }
    }
}

function closeCard(card) {
    if (card.dataset.scEditOpen) {
        const toggle = card.querySelector("[data-sc-edit-toggle]");
        if (toggle) {
            toggle.click();
        }
    }
}

function restore(card) {
    const values = savedValues(card);
    const states = card.querySelector('select[name="state_id"]');
    if (states && values.__states !== undefined) {
        states.innerHTML = values.__states;
        states.parentElement.style.display = values.__statesShown;
    }
    for (const field of fieldsOf(card)) {
        if (field.name in values) {
            field.value = values[field.name];
        }
        field.classList.remove("is-invalid");
        field.removeAttribute("aria-invalid");
    }
    showErrors(card, []);
}

export async function saveCard(card) {
    const form = accountForm(card);
    if (!form || card.dataset.scAccountBusy) {
        return;
    }
    for (const field of fieldsOf(card)) {
        if (!field.checkValidity()) {
            field.reportValidity();
            return;
        }
    }
    const data = Object.fromEntries(new FormData(form).entries());
    const own = new Set(fieldsOf(card).map((field) => field.name));
    for (const other of cards(form)) {
        if (other === card) {
            continue;
        }
        const values = savedValues(other);
        for (const field of fieldsOf(other)) {
            if (!own.has(field.name) && field.name in values) {
                data[field.name] = values[field.name];
            }
        }
    }
    card.dataset.scAccountBusy = "1";
    const button = card.querySelector("[data-sc-account-save]");
    if (button) {
        button.disabled = true;
    }
    let result;
    try {
        result = await scFetch(form.dataset.submitUrl || form.action, { method: "POST", data });
    } catch {
        return; // scFetch toasts network / server errors
    } finally {
        delete card.dataset.scAccountBusy;
        if (button) {
            button.disabled = false;
        }
    }
    if (result && result.redirectUrl) {
        snapshot(card);
        flag(form, []);
        showErrors(card, []);
        closeCard(card);
        const keys = [...card.querySelectorAll("[data-sc-fragment]")].map((n) => n.dataset.scFragment);
        if (keys.length) {
            requestRefresh(keys, { immediate: true });
        }
        card.dataset.scAccountSaved = String(Date.now());
        document.dispatchEvent(new CustomEvent("sc:toast", { detail: { message: message(form, "saved") } }));
        return;
    }
    const invalid = (result && result.invalid_fields) || [];
    const messages = [...((result && result.messages) || [])];
    if (invalid.some((name) => !own.has(name) && form.elements[name])) {
        messages.push(message(form, "other"));
    }
    flag(form, invalid);
    showErrors(card, messages);
}

function cardOf(node) {
    const card = node && node.closest && node.closest("[data-sc-edit-card^='account-']");
    return card && accountForm(card) ? card : null;
}

// The saved values: taken once the page (and the core JS) settled.
function init() {
    for (const form of document.querySelectorAll(".o_sc_app form[data-sc-account-form]")) {
        for (const card of cards(form)) {
            if (!saved.has(card)) {
                snapshot(card);
            }
        }
    }
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

// Opening a card: take its saved values now (the core JS may have filled
// the province list after load). The pencil of an OPEN card = « Cancel ».
document.addEventListener(
    "click",
    (ev) => {
        const toggle = ev.target.closest && ev.target.closest("[data-sc-edit-toggle]");
        const card = toggle && cardOf(toggle);
        if (!card) {
            return;
        }
        if (card.dataset.scEditOpen) {
            restore(card);
        } else {
            snapshot(card);
        }
    },
    true
);

document.addEventListener("click", (ev) => {
    const cancel = ev.target.closest && ev.target.closest("[data-sc-account-cancel]");
    const card = cancel && cardOf(cancel);
    if (!card) {
        return;
    }
    ev.preventDefault();
    restore(card);
    closeCard(card);
});

document.addEventListener("submit", (ev) => {
    const form = accountForm(ev.target);
    if (!form) {
        return;
    }
    ev.preventDefault();
    const card =
        cardOf(ev.submitter) ||
        cardOf(document.activeElement) ||
        cards(form).find((c) => c.dataset.scEditOpen);
    if (card) {
        saveCard(card);
    }
});
