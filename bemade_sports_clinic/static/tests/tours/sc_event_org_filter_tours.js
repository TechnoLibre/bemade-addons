/*
 * Task 1597 — browser tour of the event form's organization filter (run by
 * tests/test_event_org_team_filter_1597.py as a clinic administrator, who
 * is offered every team). Language-independent triggers; the organization
 * and team names are the test's synthetic fixtures.
 */
import { registry } from "@web/core/registry";

const tours = registry.category("web_tour.tours");

const FORM = "form[data-sc-event-form]";

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function teamBox(label) {
    const box = [...document.querySelectorAll(`${FORM} input[name="sc_team"]`)].find(
        (input) => input.closest("label").textContent.trim() === label
    );
    assert(box, `team « ${label} » is offered`);
    return box;
}

function setValue(selector, value) {
    const input = document.querySelector(selector);
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
}

tours.add("sc_1597_event_org_filter", {
    steps: () => [
        {
            content: "All organizations: teams of both organizations are offered",
            trigger: `${FORM} select[data-sc-org-select]`,
            run() {
                assert(this.anchor.value === "", "no organization is preselected");
                assert(!teamBox("PC Team A").closest("label").hidden, "PC Team A shown");
                assert(!teamBox("ZZ Team C 1597").closest("label").hidden, "ZZ Team C shown");
                assert(!teamBox("ZZ Free Team 1597").closest("label").hidden, "the team without organization is shown");
            },
        },
        {
            content: "Tick a team of each organization",
            trigger: `${FORM} input[name="sc_team"]`,
            run() {
                teamBox("PC Team A").click();
                teamBox("ZZ Team C 1597").click();
                assert(teamBox("PC Team A").checked && teamBox("ZZ Team C 1597").checked, "both ticked");
            },
        },
        {
            content: "Pick the second organization",
            trigger: `${FORM} select[data-sc-org-select]`,
            run() {
                const option = [...this.anchor.options].find((opt) => opt.text === "ZZ Org 1597");
                assert(option, "the organization is offered");
                this.anchor.value = option.value;
                this.anchor.dispatchEvent(new Event("change", { bubbles: true }));
            },
        },
        {
            content: "Only its teams remain; the other organization's team is unticked",
            trigger: `${FORM} [data-sc-section="event.form.teams"] label.o_sc_check:not([hidden]) input[name="sc_team"]`,
            run() {
                const shown = [...document.querySelectorAll(`${FORM} [data-sc-section="event.form.teams"] label.o_sc_check:not([hidden])`)].map(
                    (label) => label.textContent.trim()
                );
                assert(JSON.stringify(shown) === JSON.stringify(["ZZ Team C 1597"]),
                    `shown teams: ${shown.join(", ")}`);
                assert(!teamBox("PC Team A").checked, "PC Team A was unticked");
                assert(teamBox("ZZ Team C 1597").checked, "ZZ Team C stays ticked");
                assert(!teamBox("ZZ Free Team 1597").checked, "the free team is not ticked");
            },
        },
        {
            content: "Back to all organizations: every team is offered again, ticks kept",
            trigger: `${FORM} select[data-sc-org-select]`,
            run() {
                this.anchor.value = "";
                this.anchor.dispatchEvent(new Event("change", { bubbles: true }));
                assert(!teamBox("PC Team A").closest("label").hidden, "PC Team A shown again");
                assert(!teamBox("PC Team A").checked, "PC Team A stays unticked");
                assert(teamBox("ZZ Team C 1597").checked, "ZZ Team C stays ticked");
                const option = [...this.anchor.options].find((opt) => opt.text === "ZZ Org 1597");
                this.anchor.value = option.value;
                this.anchor.dispatchEvent(new Event("change", { bubbles: true }));
            },
        },
        {
            content: "Fill the event and create it",
            trigger: `${FORM} input[name="name"]`,
            expectUnloadPage: true,
            run() {
                setValue(`${FORM} input[name="name"]`, "SC 1597 Tour");
                setValue(`${FORM} input[name="date_start"]`, "2026-05-04T18:00");
                setValue(`${FORM} input[name="date_end"]`, "2026-05-04T20:00");
                document.querySelector(`${FORM} button[data-sc-action="event.save"]`).click();
            },
        },
        {
            content: "The event page opens",
            trigger: ".o_sc_app [data-sc-section='event.hero']",
        },
    ],
});
