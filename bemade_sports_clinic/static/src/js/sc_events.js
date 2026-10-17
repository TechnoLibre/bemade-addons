/*
 * Task 1540 (epic #1535, P3) — event form behaviours of the app shell
 * (progressive enhancement; inert outside .o_sc_app). Replaces, in the
 * shell only, the legacy create / edit pages' inline scripts:
 *
 * - on submit, the team / staff checkbox lists are joined into the CSV
 *   fields the routes accept (team_ids, assigned_staff_ids): a form posts
 *   only one value per repeated name to Odoo;
 * - « Nouveau lieu »: the venue sheet's form posts through scFetch to the
 *   CSRF-checked /my/venue/create (JSON answer); the created venue is added
 *   to the venue select and selected, the sheet closes; on the event page
 *   (task 1612) the same request also sets it on the event, then reloads;
 * - task 1597: the Organization select narrows the team checkboxes to that
 *   organization's teams (``data-sc-org-id``) and unticks the ones it hides
 *   — the model refuses the teams of two organizations; « All
 *   organizations » shows every team again (ticks kept).
 */
import { _t } from "@web/core/l10n/translation";
import { scFetch } from "@bemade_sports_clinic/js/sc_fetch";

function inShell(el) {
    return Boolean(el && el.closest && el.closest(".o_sc_app"));
}

function syncCsv(form) {
    for (const hidden of form.querySelectorAll("input[data-sc-csv-of]")) {
        const name = hidden.dataset.scCsvOf;
        hidden.value = [...form.querySelectorAll(`input[name="${name}"]:checked`)]
            .map((box) => box.value)
            .join(",");
    }
}

function filterTeams(form) {
    const select = form.querySelector("select[data-sc-org-select]");
    if (!select) {
        return;
    }
    const orgId = select.value;
    for (const box of form.querySelectorAll('input[name="sc_team"]')) {
        const label = box.closest("label");
        const visible = !orgId || (label && label.dataset.scOrgId === orgId);
        if (label) {
            label.hidden = !visible;
        }
        if (!visible) {
            box.checked = false;
        }
    }
}

function initEventForms() {
    for (const form of document.querySelectorAll("form[data-sc-event-form]")) {
        if (inShell(form)) {
            filterTeams(form);
        }
    }
}

async function createVenue(form) {
    const error = form.querySelector("[data-sc-venue-error]");
    const data = Object.fromEntries(new FormData(form).entries());
    if (form.dataset.scVenueEvent) {
        // The event page's pencil card (owner review 2026-10-11): the venue
        // is created AND set on the event by the same request (task 1612 —
        // a refused assignment leaves no orphan venue), over the event's
        // write date and venue this page last saw.
        Object.assign(data, {
            event_id: form.dataset.scVenueEvent,
            write_date: form.dataset.scVenueEventWriteDate || "",
            old_value: form.dataset.scVenueEventVenue || "",
        });
    }
    if (error) {
        error.hidden = true;
    }
    try {
        const result = await scFetch(form.action, { method: "POST", data, toast: false });
        if (!result || !result.success) {
            throw new Error((result && result.error) || "");
        }
        if (form.dataset.scVenueEvent) {
            // Reload so the card (and its venue choices) show the new venue.
            window.location.reload();
            return;
        }
        const select = document.querySelector("select[data-sc-venue-select]");
        if (select) {
            const option = document.createElement("option");
            option.value = String(result.id);
            option.textContent = result.name;
            select.appendChild(option);
            select.value = String(result.id);
        }
        form.reset();
        const dialog = form.closest("dialog");
        if (dialog) {
            dialog.close();
        }
    } catch (err) {
        if (error) {
            error.textContent = (err && err.message) || _t("The venue could not be created.");
            error.hidden = false;
        }
    }
}

document.addEventListener("submit", (ev) => {
    const form = ev.target;
    if (!(form instanceof HTMLFormElement) || !inShell(form)) {
        return;
    }
    if (form.dataset.scEventForm) {
        syncCsv(form);
    } else if (form.dataset.scVenueForm) {
        ev.preventDefault();
        createVenue(form);
    }
});

// Task 1612: keep the event page's venue sheet in step with the card's
// autosaves (a sibling field moves the write date; a venue pick changes the
// venue the sheet will be compared against).
document.addEventListener("sc:saved", (ev) => {
    const detail = ev.detail || {};
    if (detail.model !== "sports.event" || !detail.result) {
        return;
    }
    for (const form of document.querySelectorAll("form[data-sc-venue-event]")) {
        if (String(form.dataset.scVenueEvent) !== String(detail.recordId)) {
            continue;
        }
        if (detail.result.write_date) {
            form.dataset.scVenueEventWriteDate = detail.result.write_date;
        }
        if (detail.field === "venue_id" && detail.result.value !== undefined) {
            form.dataset.scVenueEventVenue = String(detail.result.value || "");
        }
    }
});

document.addEventListener("change", (ev) => {
    const select = ev.target;
    if (!(select instanceof HTMLSelectElement) || !select.matches("[data-sc-org-select]")) {
        return;
    }
    const form = select.closest("form[data-sc-event-form]");
    if (form && inShell(form)) {
        filterTeams(form);
    }
});

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEventForms);
} else {
    initEventForms();
}
