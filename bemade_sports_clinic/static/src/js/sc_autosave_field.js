/*
 * Task 1542 (epic #1535) — sc_autosave_field, the addon's first OWL public
 * component. Mounted from QWeb with
 *   <owl-component name="bemade_sports_clinic.sc_autosave_field" props="{...}"/>
 * (core PublicComponentInteraction, like portal.signature_form).
 *
 * Two modes:
 *
 * - « draft »: the value stays a LOCAL draft on the device while typing
 *   (sc_draft_store, per db + user + record key). It comes back after
 *   leaving the page or losing signal (« Brouillon restauré »), and is
 *   dropped once the server holds the same value (the enclosing form was
 *   published), on « Jeter le brouillon », on logout, and — task 1539 — when
 *   a page carrying data-sc-draft-clear for its key prefix loads (the
 *   « created » / « added » landing of a NEW injury or note). The field is a
 *   real form field (props.name): the enclosing form posts as before.
 *
 * - « server »: POST /my/app/save/<model>/<id> ({field, value, write_date}).
 *   Task 1539 (owner decision 2026-09-28): saved when the user LEAVES the
 *   field (blur / change), never while typing — one note-history row and
 *   one chatter line per field actually changed. Visible state
 *   (enregistrement / enregistré / erreur / hors ligne — en attente);
 *   offline or network failure queues the value in the draft store and
 *   replays it when back online; a 409 (THIS field changed elsewhere since
 *   it was loaded — the route compares old_value) shows the conflict banner (« Garder
 *   le mien » re-sends over the newer write_date, « Prendre le leur » takes
 *   the server value). ``instant`` fields (status, visibility: segmented
 *   buttons) save on click and offer « Annuler » in the shell toast, which
 *   re-posts the previous value through the same route.
 *   Task 1600: a 428 « confirm_identity » answer (a portal user changing a
 *   player's existing name / date of birth) shows a confirm banner
 *   (old → new); « Confirm » re-posts with confirm=1, « Cancel » restores
 *   the saved value. Nothing is written before the confirmation.
 *
 * Task 1582: ``replace`` (server-mode textarea, opt-in — the injury notes
 * only) turns the editor into a « replace » editor: the current text is shown
 * read-only (« Current text ») above an EMPTY « New note » editor, saving
 * REPLACES the text (the old one stays in the note history), « Reuse current
 * text » copies it in for a small edit, an empty editor never saves (clearing
 * stays the explicit « Clear »). Every other field is unchanged.
 *
 * Input types: textarea | text | email | tel | date | select | segmented |
 * date_na (a date + « N/A » box, value "na" or YYYY-MM-DD) | tags (CSV of the
 * chosen option keys: removable chips + a search box suggesting a few options).
 *
 * Task 1594: a sibling save may answer THIS field's fresh choices
 * (``also[field].options``, e.g. a country change → the new country's
 * provinces); ``hideEmpty`` hides a select left with no real choice.
 */
import { Component, onMounted, onWillUnmount, useRef, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { scFetch } from "@bemade_sports_clinic/js/sc_fetch";
import { readDraft, removeDraft, writeDraft } from "@bemade_sports_clinic/js/sc_draft_store";

const DRAFT_DEBOUNCE = 300;
// tags: suggestions shown at once (owner review 2026-10-10: never a long list).
const TAGS_MAX_MATCHES = 8;

function fold(text) {
    return String(text || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function norm(value) {
    return (value === null || value === undefined || value === false ? "" : String(value)).trim();
}

function asText(value) {
    return norm(value) === "" ? "" : String(value);
}

export class ScAutosaveField extends Component {
    static template = "bemade_sports_clinic.ScAutosaveField";
    static props = {
        mode: { type: String, optional: true }, // "draft" (default) | "server"
        name: { type: String, optional: true },
        naName: { type: String, optional: true }, // date_na, draft mode
        inputType: { type: String, optional: true },
        inputId: { type: String, optional: true },
        label: { type: String, optional: true },
        hint: { type: String, optional: true },
        placeholder: { type: String, optional: true },
        value: { optional: true },
        options: { type: Array, optional: true }, // [[value, label], ...]
        hideEmpty: { type: Boolean, optional: true }, // task 1594
        required: { type: Boolean, optional: true },
        disabled: { type: Boolean, optional: true },
        instant: { type: Boolean, optional: true },
        clearable: { type: Boolean, optional: true },
        undoMessage: { type: String, optional: true },
        // A history sheet opened from a link next to the label (sc_app_ui).
        historySheet: { type: String, optional: true },
        historyLabel: { type: String, optional: true },
        // Task 1582: the « replace » editor (server-mode textarea only).
        replace: { type: Boolean, optional: true },
        draftKey: { type: String, optional: true },
        // server mode
        model: { type: String, optional: true },
        recordId: { type: Number, optional: true },
        field: { type: String, optional: true },
        writeDate: { type: String, optional: true },
        "*": true,
    };

    setup() {
        this.inputRef = useRef("input");
        this.state = useState({
            // Task 1582: in replace mode ``value`` is the NEW text being
            // written (empty on edit) and ``current`` the text the server holds.
            value: this.props.replace ? "" : asText(this.props.value),
            current: asText(this.props.value),
            status: "idle", // idle | dirty | draft | saving | saved | queued | error | conflict
            restored: false,
            conflict: null,
            savedAt: "",
            message: "",
            error: "",
            query: "", // tags: the search box
            identity: null, // task 1600: {message, old, new} awaiting confirmation
            // Task 1601: the « updated on … by … » stamp under the field; a
            // save answers the fresh one (``hint``).
            hint: this.props.hint || "",
            // Task 1594: choices answered by a sibling save (null = props').
            options: null,
        });
        this.writeDate = this.props.writeDate || "";
        // The field value the server last held (sent as old_value: a record
        // written since — e.g. a sibling field saved — is not a conflict
        // while THIS field is unchanged there).
        this.lastSaved = asText(this.props.value);
        this.timer = null;
        this.onOnline = () => {
            if (this.state.status === "queued") {
                this.save();
            }
        };
        // A sibling field's save that also set THIS field (the save answers
        // it under « also », e.g. « Resolved » → the resolution date).
        this.onSiblingSaved = (ev) => {
            const detail = ev.detail || {};
            const also = detail.result && detail.result.also;
            if (
                !also ||
                !(this.props.field in also) ||
                detail.model !== this.props.model ||
                detail.recordId !== this.props.recordId
            ) {
                return;
            }
            if (Array.isArray(also[this.props.field].options)) {
                this.state.options = also[this.props.field].options;
            }
            if (["dirty", "saving"].includes(this.state.status)) {
                return;
            }
            const value = asText(also[this.props.field].value);
            if (this.isReplace) {
                this.state.current = value;
            } else {
                this.state.value = value;
            }
            this.lastSaved = value;
            this.writeDate = detail.result.write_date;
        };
        if (this.isServer) {
            document.addEventListener("sc:saved", this.onSiblingSaved);
        }
        onMounted(() => this.restore());
        onWillUnmount(() => {
            clearTimeout(this.timer);
            window.removeEventListener("online", this.onOnline);
            document.removeEventListener("sc:saved", this.onSiblingSaved);
        });
        if (this.isServer) {
            window.addEventListener("online", this.onOnline);
        }
    }

    /** The choices: the latest a sibling save answered, else the props'. */
    get options() {
        return this.state.options || this.props.options || [];
    }

    /** Task 1594: a ``hideEmpty`` select with nothing but the blank choice. */
    get isHidden() {
        return (
            Boolean(this.props.hideEmpty) &&
            this.type === "select" &&
            !this.options.some((opt) => norm(opt[0]) !== "")
        );
    }

    get isServer() {
        return this.props.mode === "server";
    }

    /** Task 1582: the opt-in « replace » editor (server-mode textarea). */
    get isReplace() {
        return Boolean(this.props.replace) && this.isServer && this.type === "textarea";
    }

    /** « Clear » is offered while there is something to clear. */
    get canClear() {
        if (!this.props.clearable || this.props.disabled) {
            return false;
        }
        return Boolean(this.isReplace ? this.state.current : this.state.value);
    }

    get type() {
        return this.props.inputType || "text";
    }

    get isNa() {
        return this.state.value === "na";
    }

    get dateValue() {
        return this.isNa ? "" : this.state.value;
    }

    get key() {
        if (this.props.draftKey) {
            return this.props.draftKey;
        }
        return `${this.props.model}.${this.props.recordId}.${this.props.field}`;
    }

    get statusLabel() {
        switch (this.state.status) {
            case "draft":
                return _t("Draft kept on this device");
            case "saving":
                return _t("Saving…");
            case "saved":
                return this.state.savedAt ? _t("Saved · %s", this.state.savedAt) : _t("Saved");
            case "queued":
                return _t("Offline — pending");
            case "error":
                return _t("Error — not saved");
            case "conflict":
                return _t("Changed elsewhere");
            case "confirm":
                return _t("To confirm");
            default:
                return "";
        }
    }

    get conflictText() {
        const by = this.state.conflict && this.state.conflict.by;
        return by
            ? _t("%s changed this field while you were typing.", by)
            : _t("This field was changed elsewhere while you were typing.");
    }

    get identityChange() {
        const identity = this.state.identity || {};
        return `${identity.old || "—"} → ${identity.new || "—"}`;
    }

    get naLabel() {
        return _t("N/A");
    }

    get noMatchLabel() {
        return _t("No match");
    }

    removeLabel(label) {
        return _t("Remove %s", label);
    }

    // ------------------------------------------------------------ restore
    restore() {
        const draft = readDraft(this.key);
        if (!draft) {
            return;
        }
        if (this.isServer) {
            // A queued (unsent) value: show it and send it again.
            this.state.value = draft.value;
            this.writeDate = draft.writeDate || this.writeDate;
            this.state.status = "queued";
            if (navigator.onLine !== false) {
                this.save();
            }
            return;
        }
        if (norm(draft.value) === norm(this.props.value)) {
            // The server already holds it (published): the draft is done.
            removeDraft(this.key);
            return;
        }
        this.state.value = draft.value;
        this.state.restored = true;
        this.state.status = "draft";
        const details = this.inputRef.el && this.inputRef.el.closest("details");
        if (details) {
            details.open = true;
        }
        // Inside an edit card's hidden edit view: ask sc_app_ui to open it.
        const card = this.inputRef.el && this.inputRef.el.closest("[data-sc-edit-card]");
        if (card) {
            card.dispatchEvent(new CustomEvent("sc:edit-open", { bubbles: true }));
        }
    }

    discardDraft() {
        removeDraft(this.key);
        this.state.value = asText(this.props.value);
        this.state.restored = false;
        this.state.status = "idle";
    }

    // -------------------------------------------------------------- input
    onInput() {
        clearTimeout(this.timer);
        this.state.status = "dirty";
        if (!this.isServer) {
            this.timer = setTimeout(() => this.keepDraft(), DRAFT_DEBOUNCE);
        }
    }

    /** blur / change: the user left the field (or picked a value). */
    commit() {
        if (this.state.status !== "dirty") {
            return;
        }
        clearTimeout(this.timer);
        if (this.isReplace && (norm(this.state.value) === "" || this.state.value === this.lastSaved)) {
            // Task 1582: an empty « New note » never saves (never clears),
            // and the untouched current text is not a change.
            this.state.status = "idle";
            return;
        }
        if (this.isServer) {
            this.save();
        } else {
            this.keepDraft();
        }
    }

    /** « Effacer »: an explicit clear, saved (or drafted) at once. */
    clear() {
        this.state.value = "";
        this.state.status = "dirty";
        if (this.isReplace) {
            // The explicit clear bypasses the « empty never saves » rule.
            this.save();
            return;
        }
        this.commit();
    }

    /** Task 1582: « Reuse current text » — a small edit of the current text. */
    reuseCurrent() {
        this.state.value = this.state.current;
        const el = this.inputRef.el;
        if (el) {
            // The textarea gets the value on the next render (t-model).
            el.value = this.state.current;
            el.focus();
            el.setSelectionRange(0, 0);
            el.scrollTop = 0;
        }
    }

    onChange() {
        this.state.status = "dirty";
        this.commit();
    }

    onNaToggle(ev) {
        if (ev.target.checked) {
            this.state.value = "na";
        } else {
            this.state.value = "";
            // Nothing to save until a date is picked (the model refuses a
            // blank date without « N/A »).
            this.state.status = "idle";
            return;
        }
        this.onChange();
    }

    // --------------------------------------------------------------- tags
    get checkedKeys() {
        return (this.state.value || "").split(",").map((key) => key.trim()).filter(Boolean);
    }

    isChecked(key) {
        return this.checkedKeys.includes(String(key));
    }

    get chosenOptions() {
        const keys = this.checkedKeys;
        return this.options.filter((opt) => keys.includes(String(opt[0])));
    }

    get tagMatches() {
        const query = fold(this.state.query).trim();
        if (!query) {
            return [];
        }
        const words = query.split(/\s+/);
        return this.options
            .filter((opt) => !this.isChecked(opt[0]))
            .filter((opt) => words.every((word) => fold(opt[1]).includes(word)))
            .slice(0, TAGS_MAX_MATCHES);
    }

    addTag(key) {
        this.state.query = "";
        this.onCheck(key, true);
        if (this.inputRef.el) {
            this.inputRef.el.focus();
        }
    }

    onTagKeydown(ev) {
        if (ev.key === "Enter") {
            ev.preventDefault();
            const first = this.tagMatches[0];
            if (first) {
                this.addTag(first[0]);
            }
        } else if (ev.key === "Escape") {
            this.state.query = "";
        }
    }

    onCheck(key, checked) {
        const keys = new Set(this.checkedKeys);
        if (checked) {
            keys.add(String(key));
        } else {
            keys.delete(String(key));
        }
        this.onPick([...keys].sort((a, b) => Number(a) - Number(b)).join(","));
    }

    onPick(value) {
        if (this.props.disabled || String(value) === this.state.value) {
            return;
        }
        const previous = this.state.value;
        this.state.value = String(value);
        this.state.status = "dirty";
        if (this.isServer) {
            this.save().then((ok) => {
                if (ok && this.props.instant) {
                    this.offerUndo(previous);
                }
            });
        } else {
            this.keepDraft();
        }
    }

    offerUndo(previous) {
        document.dispatchEvent(
            new CustomEvent("sc:toast", {
                detail: {
                    message: this.props.undoMessage || _t("Change saved"),
                    actionLabel: _t("Undo"),
                    action: () => {
                        this.state.value = previous;
                        this.save();
                    },
                },
            })
        );
    }

    keepDraft() {
        if (norm(this.state.value) === norm(this.props.value)) {
            removeDraft(this.key);
            this.state.status = "idle";
            return;
        }
        this.state.status = writeDraft(this.key, { value: this.state.value }) ? "draft" : "idle";
    }

    // --------------------------------------------------------------- save
    get saveUrl() {
        return `/my/app/save/${encodeURIComponent(this.props.model)}/${this.props.recordId}`;
    }

    queue() {
        writeDraft(this.key, { value: this.state.value, writeDate: this.writeDate });
        this.state.status = "queued";
    }

    /** @returns {Promise<boolean>} saved */
    async save({ confirm = false } = {}) {
        clearTimeout(this.timer);
        this.state.identity = null;
        if (navigator.onLine === false) {
            this.queue();
            return false;
        }
        this.state.status = "saving";
        this.state.error = "";
        try {
            const result = await scFetch(this.saveUrl, {
                method: "POST",
                data: Object.assign(
                    {
                        field: this.props.field,
                        value: this.state.value,
                        write_date: this.writeDate,
                        old_value: this.lastSaved,
                    },
                    confirm ? { confirm: "1" } : {}
                ),
                toast: false,
            });
            this.writeDate = result.write_date;
            if (result.value !== undefined && this.type !== "textarea") {
                this.state.value = asText(result.value);
            }
            this.lastSaved = result.value !== undefined ? asText(result.value) : this.state.value;
            if (this.isReplace) {
                // Task 1582: the saved text becomes the current one; the
                // editor is empty again for the next replacement.
                this.state.current = this.lastSaved;
                this.state.value = "";
            }
            this.state.message = result.message || "";
            if (result.hint !== undefined) {
                this.state.hint = result.hint || "";
            }
            removeDraft(this.key);
            const now = new Date();
            this.state.savedAt = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
            this.state.status = "saved";
            this.state.conflict = null;
            // Lets the page reflect a save elsewhere (e.g. the player's
            // status pill, owner review 2026-10-10).
            document.dispatchEvent(
                new CustomEvent("sc:saved", {
                    detail: {
                        model: this.props.model,
                        recordId: this.props.recordId,
                        field: this.props.field,
                        result,
                    },
                })
            );
            return true;
        } catch (error) {
            if (error.status === 428 && error.payload && error.payload.confirm_identity) {
                // Task 1600: changing a player's existing name / date of
                // birth is an explicit step — nothing was saved yet.
                this.state.identity = error.payload;
                this.state.status = "confirm";
            } else if (error.status === 409 && error.payload) {
                this.state.conflict = error.payload;
                this.state.status = "conflict";
            } else if (error.status === 0) {
                this.queue();
            } else {
                this.state.status = "error";
                this.state.error = (error.payload && error.payload.message) || "";
            }
            return false;
        }
    }

    /** Task 1600: « Confirm » on the identity banner — the same save, confirmed. */
    confirmIdentity() {
        this.save({ confirm: true });
    }

    /** « Cancel »: back to the value the server holds, nothing saved. */
    cancelIdentity() {
        this.state.identity = null;
        this.state.value = this.isReplace ? "" : this.lastSaved;
        this.state.status = "idle";
        removeDraft(this.key);
    }

    keepMine() {
        this.writeDate = this.state.conflict.current_write_date;
        this.lastSaved = asText(this.state.conflict.current_value);
        this.state.conflict = null;
        this.save();
    }

    takeTheirs() {
        const conflict = this.state.conflict;
        const theirs = asText(conflict.current_value);
        if (this.isReplace) {
            this.state.current = theirs;
            this.state.value = "";
        } else {
            this.state.value = theirs;
        }
        this.writeDate = conflict.current_write_date;
        this.lastSaved = theirs;
        this.state.conflict = null;
        removeDraft(this.key);
        this.state.status = "saved";
    }
}

registry.category("public_components").add("bemade_sports_clinic.sc_autosave_field", ScAutosaveField);
