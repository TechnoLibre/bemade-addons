/*
 * Task 1620 — « Mon compte » / « Sécurité » in the shell
 * (tests/test_account_security_tours_1620.py).
 *
 * sc_1620_account: Paramètres → Mon compte; an email the core validation
 * refuses shows its error in the shell (#errors + the field flagged); a
 * new phone saves through the core form JS (/my/address/submit) and lands
 * back with the « saved » toast; back → Paramètres.
 * sc_1620_security: Paramètres → Sécurité; the core « show password » eye;
 * a wrong current password comes back with its error; the right one shows
 * the success banner; the delete-account sheet opens and closes (nothing
 * submitted); back → Paramètres.
 * Language-independent triggers (ids, names, data-sc-*).
 */
import { registry } from "@web/core/registry";

const tours = registry.category("web_tour.tours");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function leave(el) {
    el.blur();
    el.dispatchEvent(new FocusEvent("blur")); // headless CI
}

function noOverflow() {
    const doc = document.documentElement;
    assert(doc.scrollWidth <= window.innerWidth + 1,
        `horizontal overflow: ${doc.scrollWidth} > ${window.innerWidth}`);
}

// The start page we come back to through history.back() reloads itself
// when it is restored from the back/forward cache (a fresh tour run, as in
// the 1579 / 1618 tours).
function reloadIfRestored() {
    window.addEventListener("pageshow", (ev) => {
        if (ev.persisted) {
            window.location.reload();
        }
    });
}

const FORM = ".o_customer_address_fill form.address_autoformat";

tours.add("sc_1620_account", {
    url: "/my/app/settings",
    steps: () => [
        {
            content: "Paramètres → Mon compte",
            trigger: '#sc_account a[href="/my/account"]',
            run(helpers) {
                reloadIfRestored();
                return helpers.click();
            },
            expectUnloadPage: true,
        },
        {
            content: "The shell page with the core form, prefilled",
            trigger: `.o_sc_app ${FORM} input[name="phone"]`,
            run() {
                assert(document.querySelector("a[data-sc-back]"), "no back arrow");
                assert(!document.querySelector("header#top"), "website header shown");
                assert(document.querySelector(`${FORM} input[name="name"]`).value === "PC Coach",
                    "name not prefilled");
                noOverflow();
            },
        },
        {
            content: "An email the server refuses (the browser accepts it)",
            trigger: `${FORM} input[name="email"]`,
            run: "edit coach@localhost",
        },
        {
            trigger: `${FORM} input[name="email"]`,
            run() {
                leave(this.anchor);
            },
        },
        {
            content: "Save",
            trigger: `${FORM} #save_address`,
            run: "click",
        },
        {
            content: "The core error, in the shell",
            trigger: ".o_customer_address_fill #errors h5",
            run() {
                assert(document.querySelector(`${FORM} input[name="email"]`).classList.contains("is-invalid"),
                    "email not flagged");
            },
        },
        {
            content: "Back to a good email",
            trigger: `${FORM} input[name="email"]`,
            run: "edit pc.coach@example.com",
        },
        {
            content: "A new phone",
            trigger: `${FORM} input[name="phone"]`,
            run: "edit +1 514-555-0177",
        },
        {
            trigger: `${FORM} input[name="phone"]`,
            run() {
                leave(this.anchor);
            },
        },
        {
            content: "Save",
            trigger: `${FORM} #save_address`,
            run: "click",
            expectUnloadPage: true,
        },
        {
            content: "Back on Mon compte with the « saved » toast",
            trigger: '.o_sc_app .o_sc_toast[data-sc-toast-tone="success"]:not([hidden]):contains("saved")',
            run() {
                const phone = document.querySelector(`${FORM} input[name="phone"]`).value;
                assert(phone.replace(/\D/g, "").endsWith("5145550177"), `phone not saved: ${phone}`);
            },
        },
        {
            content: "Back → Paramètres",
            trigger: "a[data-sc-back]",
            run: "click",
            expectUnloadPage: true,
        },
        {
            content: "On Paramètres",
            trigger: '#sc_account a[href="/my/security"]',
        },
    ],
});

const PW = '#sc_security_password form[action="/my/security"]';

function passwordSteps(old, next) {
    return [
        { trigger: `${PW} input[name="old"]`, run: `edit ${old}` },
        { trigger: `${PW} input[name="new1"]`, run: `edit ${next}` },
        { trigger: `${PW} input[name="new2"]`, run: `edit ${next}` },
        {
            trigger: `${PW} input[name="new2"]`,
            run() {
                leave(this.anchor);
            },
        },
        {
            content: "Change password",
            trigger: `${PW} button[type="submit"]`,
            run: "click",
            expectUnloadPage: true,
        },
    ];
}

tours.add("sc_1620_security", {
    url: "/my/app/settings",
    steps: () => [
        {
            content: "Paramètres → Sécurité",
            trigger: '#sc_account a[href="/my/security"]',
            run(helpers) {
                reloadIfRestored();
                return helpers.click();
            },
            expectUnloadPage: true,
        },
        {
            content: "The shell page",
            trigger: `.o_sc_app .o_portal_security_body ${PW}`,
            run() {
                assert(document.querySelector("a[data-sc-back]"), "no back arrow");
                assert(document.querySelector("#portal_revoke_all_sessions_popup"), "no « log out everywhere »");
                noOverflow();
            },
        },
        {
            content: "The core eye shows the password",
            trigger: `${PW} input[name="old"] + .o_show_password`,
            run: "click",
        },
        {
            trigger: `${PW} input[name="old"][type="text"]`,
        },
        {
            trigger: `${PW} input[name="old"] + .o_show_password`,
            run: "click",
        },
        {
            trigger: `${PW} input[name="old"][type="password"]`,
        },
        ...passwordSteps("not-the-password", "pc-coach-tour-1620"),
        {
            content: "The core error, in the shell",
            trigger: '.o_sc_app [data-sc-error-for="old"]',
        },
        ...passwordSteps("pc-coach", "pc-coach-tour-1620"),
        {
            content: "Changed",
            trigger: '.o_sc_app [data-sc-section="security.password.done"]',
        },
        {
            content: "Open « Delete account »",
            trigger: 'button[data-sc-sheet-open="sc_deactivate_account_sheet"]',
            run: "click",
        },
        {
            content: "The sheet asks for the password and the login",
            trigger: 'dialog#sc_deactivate_account_sheet[open] input[name="password"]',
            run() {
                assert(document.querySelector('dialog#sc_deactivate_account_sheet[open] input[name="validation"]'),
                    "no login confirmation");
            },
        },
        {
            content: "Cancel",
            trigger: "dialog#sc_deactivate_account_sheet[open] .o_sc_form_actions [data-sc-sheet-close]",
            run: "click",
        },
        {
            content: "Closed",
            trigger: "dialog#sc_deactivate_account_sheet:not([open]):not(:visible)",
        },
        {
            content: "Back → Paramètres",
            trigger: "a[data-sc-back]",
            run: "click",
            expectUnloadPage: true,
        },
        {
            content: "On Paramètres",
            trigger: '#sc_account a[href="/my/account"]',
        },
    ],
});
