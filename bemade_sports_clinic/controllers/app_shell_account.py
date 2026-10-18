"""Task 1620 — « Mon compte » (/my/account) and « Sécurité » (/my/security)
in the app shell.

The core portal routes keep ALL their logic: values, address validation
(the form still posts to the core ``/my/address/submit``), the password
change, the account deletion and whatever other installed modules add to
their values. Only the RENDERING changes: when the core answers with its
own template and the app shell is active for the viewer, the same values are
rendered with the shell template instead. Shell off (or a viewer without an
app role) → the core response, untouched.
"""
from odoo import _, http
from odoo.http import request

from .app_shell import AppShellPortal

# Core template → shell template.
SC_ACCOUNT_TEMPLATES = {
    'portal.portal_my_details': 'bemade_sports_clinic.sc_app_account',
    'portal.portal_my_security': 'bemade_sports_clinic.sc_app_security',
}
# Where a successful « Mon compte » save lands (the « saved » toast).
SC_ACCOUNT_SAVED_URL = '/my/account?sc_saved=1'
# The core headers these pages carry (no framing by other sites).
_KEPT_HEADERS = ('X-Frame-Options', 'Content-Security-Policy')


class AppShellAccountPortal(AppShellPortal):

    def _sc_core_in_shell(self, response, extra=None):
        """``response`` (a core page) rendered in the shell with its own
        values, when the shell is active and the core rendered one of the
        templates above; anything else (redirect, other template) as is."""
        template = getattr(response, 'template', None)
        app_template = SC_ACCOUNT_TEMPLATES.get(template)
        if not app_template or not getattr(response, 'is_qweb', False):
            return response
        if not self._sc_app_shell_active():
            return response
        values = dict(response.qcontext or {})
        values.update(extra or {})
        values['page_name'] = app_template.rpartition('.')[2]
        shell = self._sc_shell_response(app_template, self._sc_app_values(values, app_template))
        for header in _KEPT_HEADERS:
            if header in response.headers:
                shell.headers[header] = response.headers[header]
        return shell

    # ------------------------------------------------------------------
    # /my/account — « Mon compte »
    # ------------------------------------------------------------------
    @http.route()
    def account(self, **kwargs):
        if not self._sc_app_shell_active():
            return super().account(**kwargs)
        saved = kwargs.pop('sc_saved', None)
        if not kwargs.get('redirect'):
            # Core default: back to /my. In the app: back here, with a toast.
            kwargs['redirect'] = SC_ACCOUNT_SAVED_URL
        extra = {}
        if saved:
            extra['sc_notification'] = {
                'message': _("Your details have been saved."),
                'title': '',
                'tone': 'success',
            }
        return self._sc_core_in_shell(super().account(**kwargs), extra)

    # ------------------------------------------------------------------
    # /my/security — « Sécurité » (GET + the password POST)
    # ------------------------------------------------------------------
    @http.route()
    def security(self, **post):
        response = super().security(**post)
        return self._sc_core_in_shell(response, self._sc_security_extra())

    @http.route()
    def deactivate_account(self, validation, password, **post):
        response = super().deactivate_account(validation, password, **post)
        return self._sc_core_in_shell(response, self._sc_security_extra())

    @staticmethod
    def _sc_security_extra():
        """What the shell page shows, decided like the core does: the
        two-factor section only when ``auth_totp_portal`` adds it, the
        delete-account block for portal users only (its ``groups``)."""
        env = request.env
        return {
            'sc_totp_portal': bool(env.ref('auth_totp_portal.totp_portal_hook',
                                           raise_if_not_found=False)),
            'sc_can_deactivate': env.user.has_group('base.group_portal'),
        }
