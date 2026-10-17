"""Team page « Add a player » inline (owner review 2026-10-11). Synthetic
fixtures only.

Acceptance criteria:

* UC-AP1 « Add a player » is an inline card at the top of the Players tab
  (like the other « Add » cards), not an app-bar action to the legacy page:
  a search by first name, last name and optional date of birth.
* UC-AP2 The search lists matching players (archived ones too, for the
  therapist adding): each offers « Add to team » (« Reactivate and add »
  when archived), or says it is already on the team; « Create a new
  player » with the typed name (and date of birth if given) comes after.
* UC-AP3 « Add to team » links that player and comes back to the Players
  tab with a confirmation.
* UC-AP4 « Create a new player » creates a NEW player with that name and
  date of birth (even when a similar name exists), on this team, and opens
  the new player's page (Info tab, team context) to complete it.
* UC-AP5 A coach gets the « Request an addition » form inline instead.
"""
from datetime import date
from urllib.parse import parse_qs, urlparse

from odoo import Command
from odoo.tests import tagged

from odoo.addons.bemade_sports_clinic.tests.test_app_shell_switch_1538 import AppShellCommon


@tagged('post_install', '-at_install')
class TestAppShellTeamAddPlayer(AppShellCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.url = '/my/team?team_id=%s&tab=players' % cls.team_a.id
        cls.other = cls.env['sports.patient'].create({
            'first_name': 'Sam', 'last_name': 'Synthetic', 'date_of_birth': date(2010, 1, 2),
            'team_ids': [Command.set([cls.team_b.id])]})
        cls.archived = cls.env['sports.patient'].create({
            'first_name': 'Sara', 'last_name': 'Synthetic'})
        cls.archived.action_archive()

    def setUp(self):
        super().setUp()
        self._switch(True)

    def _card(self, tree):
        panel = tree.xpath('//section[@data-sc-tab-panel="players"]')[0]
        cards = panel.xpath('./details[@data-sc-section="team.add_player"]')
        self.assertEqual(len(cards), 1)
        return cards[0]

    # -- UC-AP1 ----------------------------------------------------------
    def test_inline_card_search_form(self):
        self._login_tp()
        _text, tree = self._get(self.url)
        card = self._card(tree)
        form = card.xpath('.//form[@data-sc-form="player.search"]')[0]
        self.assertEqual(form.get('method'), 'get')
        names = set(form.xpath('.//*[@name]/@name'))
        for name in ('team_id', 'tab', 'add_first', 'add_last', 'add_dob'):
            self.assertIn(name, names)
        self.assertFalse(tree.xpath('//header//*[@data-sc-action="team.add_player"]'))

    # -- UC-AP2 ----------------------------------------------------------
    def test_search_results(self):
        self._login_tp()
        _text, tree = self._get(self.url + '&add_last=Synthetic')
        card = self._card(tree)
        self.assertIsNotNone(card.get('open'))
        rows = {int(r.get('data-sc-player-id')): r for r in card.xpath('.//*[@data-sc-add-result]')}
        self.assertIn(self.other.id, rows)
        self.assertIn(self.archived.id, rows)
        link = rows[self.other.id].xpath('.//form[@data-sc-form="player.link"]')[0]
        self.assertEqual(link.get('action'), '/my/team/%s/player/add' % self.team_a.id)
        self.assertEqual(link.xpath('.//input[@name="existing_id"]/@value'), [str(self.other.id)])
        self.assertTrue(rows[self.archived.id].xpath('.//button[@data-sc-action="player.reactivate"]'))
        _text, tree = self._get(self.url + '&add_last=One')
        rows = {int(r.get('data-sc-player-id')): r for r in self._card(tree).xpath('.//*[@data-sc-add-result]')}
        self.assertTrue(rows[self.player.id].xpath('.//*[@data-sc-on-team]'))
        create = self._card(tree).xpath('.//form[@data-sc-form="player.create"]')
        self.assertEqual(len(create), 1)

    # -- UC-AP3 ----------------------------------------------------------
    def test_link_existing(self):
        self._login_tp()
        resp = self.url_open('/my/team/%s/player/add' % self.team_a.id, data={
            'csrf_token': self._csrf(), 'existing_id': self.other.id, 'sc_inline': '1',
        }, allow_redirects=False)
        self.assertEqual(resp.status_code, 303, resp.text[:200])
        self.assertIn(self.team_a, self.other.sudo().team_ids)
        target = urlparse(resp.headers['Location'])
        args = parse_qs(target.query)
        self.assertEqual(target.path, '/my/team')
        self.assertEqual(args.get('tab'), ['players'])
        self.assertEqual(args.get('success'), ['player_added_to_team'])

    # -- UC-AP4 ----------------------------------------------------------
    def test_create_new_opens_player(self):
        self._login_tp()
        resp = self.url_open('/my/team/%s/player/add' % self.team_a.id, data={
            'csrf_token': self._csrf(), 'first_name': 'Sam', 'last_name': 'Synthetic',
            'date_of_birth': '2011-03-04', 'force_new': '1', 'sc_inline': '1',
        }, allow_redirects=False)
        self.assertEqual(resp.status_code, 303, resp.text[:200])
        new = self.env['sports.patient'].sudo().search([
            ('first_name', '=', 'Sam'), ('last_name', '=', 'Synthetic'), ('id', '!=', self.other.id)])
        self.assertEqual(len(new), 1)
        self.assertEqual(new.date_of_birth, date(2011, 3, 4))
        self.assertIn(self.team_a, new.team_ids)
        target = urlparse(resp.headers['Location'])
        args = parse_qs(target.query)
        self.assertEqual(target.path, '/my/player')
        self.assertEqual(args.get('player_id'), [str(new.id)])
        self.assertEqual(args.get('team_id'), [str(self.team_a.id)])
        self.assertEqual(args.get('tab'), ['info'])
        # The other Sam was left alone.
        self.assertNotIn(self.team_a, self.other.sudo().team_ids)

    # -- UC-AP5 ----------------------------------------------------------
    def test_coach_request_inline(self):
        self._login_coach()
        _text, tree = self._get(self.url)
        panel = tree.xpath('//section[@data-sc-tab-panel="players"]')[0]
        self.assertFalse(panel.xpath('./details[@data-sc-section="team.add_player"]'))
        form = panel.xpath('./details[@data-sc-section="team.request_add"]//form')[0]
        self.assertEqual(form.get('action'), '/my/team/%s/player/request_add' % self.team_a.id)
