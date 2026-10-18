"""Task 1620 — « Mon compte » / « Sécurité » in a browser
(static/tests/tours/sc_account_security_1620_tours.js). Synthetic fixtures
only.

Acceptance criteria covered here (laptop 1366 px and phone 360 px):

* UC-T1 Paramètres → Mon compte (review fixes 2026-10-18 b: pencil cards):
  read cards; the province select as tall as the inputs; Cancel restores;
  the core validation's error shows in the card being edited (field
  flagged); a new phone, then a new city, save in place (read view, toast,
  no reload); back → Paramètres; no horizontal overflow.
* UC-T2 Paramètres → Sécurité: the core « show password » eye; a wrong
  current password comes back with its error; the right one changes it
  (success banner, the new password works); the delete-account sheet opens
  and cancels; back → Paramètres.

Both themes' look, the 2FA dialogs (core OWL dialogs over the shell) and
« Log out from all devices » stay UNVERIFIED here — the dev-review
click-through covers them.
"""
from odoo.tests import tagged

from odoo.addons.bemade_sports_clinic.tests.test_account_security_shell_1620 import AccountShellCommon


class _Tours1620:

    def test_account(self):
        self._switch(True)
        self.start_tour('/my/app/settings', 'sc_1620_account', login='pc.coach@example.com')
        self.assertTrue(self.coach.partner_id.phone)
        self.assertTrue(''.join(c for c in self.coach.partner_id.phone if c.isdigit())
                        .endswith('5145550177'), self.coach.partner_id.phone)
        self.assertEqual(self.coach.partner_id.email, 'pc.coach@example.com')
        # Review fixes 2026-10-18 b: the address card saved too, the contact
        # card's values kept.
        self.assertEqual(self.coach.partner_id.city, 'Synthetic City')

    def test_security(self):
        self._switch(True)
        self.start_tour('/my/app/settings', 'sc_1620_security', login='pc.coach@example.com')
        self.authenticate('pc.coach@example.com', 'pc-coach-tour-1620')
        self.assertTrue(self.coach.active)


@tagged('post_install', '-at_install')
class TestAccountSecurityToursLaptop1620(_Tours1620, AccountShellCommon):
    browser_size = '1366x768'
    allow_inherited_tests_method = True


@tagged('post_install', '-at_install')
class TestAccountSecurityToursPhone1620(_Tours1620, AccountShellCommon):
    browser_size = '360x740'
    allow_inherited_tests_method = True
