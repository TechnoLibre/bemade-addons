/*
 * Task 1616 — the injury card as the injury's page (inert outside .o_sc_app):
 *
 * - button[data-sc-injury-done] (« Done » at the bottom of an open card):
 *   closes the card's open edit groups (Details / Notes / a document) and
 *   the card itself; the read fragments refresh at once (task 1611);
 * - form[data-sc-form="injury.documents.upload"] (the « Add documents »
 *   sheet): several files at once — the chosen files are listed with their
 *   size, a file over the limit (data-sc-max-bytes) is flagged and blocks
 *   the upload (the server refuses it too: all or nothing); on a laptop the
 *   drop zone ([data-sc-dropzone]) takes dropped files.
 */
import { _t } from "@web/core/l10n/translation";

function inShell(node) {
    return Boolean(node && node.closest && node.closest(".o_sc_app"));
}

// ---------------------------------------------------------------- « Done »
document.addEventListener("click", (ev) => {
    const done = ev.target.closest && ev.target.closest("[data-sc-injury-done]");
    if (!done || !inShell(done)) {
        return;
    }
    const card = done.closest("details.o_sc_injury_item");
    if (!card) {
        return;
    }
    ev.preventDefault();
    // Each open edit group closes through its own « Done » (sc_app_ui.js).
    for (const button of card.querySelectorAll("[data-sc-edit-open] [data-sc-edit-done]")) {
        button.click();
    }
    if (card.contains(document.activeElement)) {
        document.activeElement.blur();
    }
    card.open = false;
    document.dispatchEvent(new CustomEvent("sc:refresh-now"));
    card.scrollIntoView({ block: "nearest" });
});

// ------------------------------------------------------ « Add documents »
function formatSize(bytes) {
    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** List the chosen files; true when every one fits under the limit. */
function checkFiles(form) {
    const input = form.querySelector('input[type="file"]');
    const list = form.querySelector("[data-sc-file-list]");
    const error = form.querySelector("[data-sc-file-error]");
    const max = parseInt(form.dataset.scMaxBytes || "0", 10);
    const files = [...(input?.files || [])];
    let ok = true;
    if (list) {
        list.replaceChildren(
            ...files.map((file) => {
                const item = document.createElement("li");
                const tooLarge = max && file.size > max;
                ok = ok && !tooLarge;
                item.className = tooLarge ? "o_sc_file o_sc_file_too_large" : "o_sc_file";
                item.dataset.scFileTooLarge = tooLarge ? "1" : "0";
                const name = document.createElement("span");
                name.className = "o_sc_file_name";
                name.textContent = file.name;
                const size = document.createElement("span");
                size.className = "o_sc_file_size";
                size.textContent = tooLarge
                    ? _t("%(size)s — over 10 MB", { size: formatSize(file.size) })
                    : formatSize(file.size);
                item.append(name, size);
                return item;
            })
        );
        list.hidden = !files.length;
    } else {
        ok = !files.some((file) => max && file.size > max);
    }
    if (error) {
        error.hidden = ok;
    }
    const text = form.querySelector(".o_sc_dropzone_text");
    if (text) {
        text.dataset.scOriginal = text.dataset.scOriginal || text.textContent;
        text.textContent = files.length
            ? _t("%(count)s file(s) chosen", { count: files.length })
            : text.dataset.scOriginal;
    }
    return ok;
}

function uploadForm(node) {
    const form = node && node.closest && node.closest('form[data-sc-form="injury.documents.upload"]');
    return form && inShell(form) ? form : null;
}

document.addEventListener("change", (ev) => {
    const form = uploadForm(ev.target);
    if (form && ev.target.matches('input[type="file"]')) {
        checkFiles(form);
    }
});

document.addEventListener(
    "submit",
    (ev) => {
        const form = uploadForm(ev.target);
        if (form && !checkFiles(form)) {
            ev.preventDefault();
            ev.stopPropagation();
        }
    },
    true
);

// Drop zone (laptop): dropped files become the input's files.
for (const type of ["dragenter", "dragover"]) {
    document.addEventListener(type, (ev) => {
        const zone = ev.target.closest && ev.target.closest("[data-sc-dropzone]");
        if (zone && inShell(zone)) {
            ev.preventDefault();
            zone.classList.add("o_sc_dropzone_over");
        }
    });
}
document.addEventListener("dragleave", (ev) => {
    const zone = ev.target.closest && ev.target.closest("[data-sc-dropzone]");
    if (zone && !zone.contains(ev.relatedTarget)) {
        zone.classList.remove("o_sc_dropzone_over");
    }
});
document.addEventListener("drop", (ev) => {
    const zone = ev.target.closest && ev.target.closest("[data-sc-dropzone]");
    if (!zone || !inShell(zone)) {
        return;
    }
    ev.preventDefault();
    zone.classList.remove("o_sc_dropzone_over");
    const input = zone.querySelector('input[type="file"]');
    if (input && ev.dataTransfer && ev.dataTransfer.files.length) {
        input.files = ev.dataTransfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
    }
});
