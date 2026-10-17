/*
 * Task 1612 — « Nouveau lieu » from the event page's pencil card: after a
 * sibling field's autosave (the event's write date moved), the new venue is
 * created AND set on the event in one request, no « HTTP 400 », and the card
 * shows it after the reload. Synthetic data only.
 */
import { registry } from "@web/core/registry";

const tours = registry.category("web_tour.tours");

const CARD = '[data-sc-edit-card="event"]';
const NAME = `${CARD} .o_sc_autosave[data-sc-field="name"]`;
const SHEET_FORM = "form[data-sc-venue-form]";

tours.add("sc_1612_event_new_venue", {
    steps: () => [
        {
            content: "Open the event card",
            trigger: `${CARD} button[data-sc-edit-toggle]`,
            run: "click",
        },
        {
            content: "Rename the event (a sibling autosave moves the write date)",
            trigger: `${NAME} input`,
            run() {
                const input = this.anchor;
                input.focus();
                input.value = "Tour 1612 Game renamed";
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
                input.blur(); input.dispatchEvent(new FocusEvent("blur")); // headless CI: blur() fires no event without window focus
            },
        },
        {
            content: "Saved",
            trigger: `${NAME}[data-sc-state="saved"]`,
        },
        {
            content: "« New venue »",
            trigger: `${CARD} button[data-sc-action="venue.new"]`,
            run: "click",
        },
        {
            content: "Name the venue",
            trigger: `${SHEET_FORM} input[name="name"]`,
            run: "edit Tour 1612 Arena",
        },
        {
            content: "Save the venue (the page reloads on success)",
            trigger: `${SHEET_FORM} button[type="submit"]`,
            run: "click",
            expectUnloadPage: true,
        },
        {
            content: "The page reloads with the venue on the event, no error",
            trigger: '[data-sc-section="event.hero"] [data-sc-edit-view="read"] dd:contains("Tour 1612 Arena")',
            run() {
                const error = document.querySelector("[data-sc-venue-error]");
                if (error && !error.hidden) {
                    throw new Error(`venue error shown: ${error.textContent}`);
                }
            },
        },
    ],
});
