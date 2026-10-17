"""Task 1615: the training recommendation right under the play status.
Synthetic fixtures only.

Acceptance criteria:

* AC-1 Therapist, player header: the play-status selector, then (its very
  next block) the training recommendation, then « Retour prévu », then the
  allergies banner.
* AC-2 Coach, player header: the status label (Match / Practice read-only),
  then the training recommendation (read-only), then « Retour prévu »
  (read-only), then the allergies holder.
* AC-3 Nothing else moves: the header still opens on the name / team head
  and ends on the actions row; the #1611 fragment keys of the header
  regions are unchanged.
* AC-4 Clinic dossier: the play status, then the training recommendation,
  in the same « status » card.
"""
from odoo.tests import tagged

from odoo.addons.bemade_sports_clinic.tests.test_app_shell_clinic_1540 import Clinic1540Common
from odoo.addons.bemade_sports_clinic.tests.test_app_shell_player_inline import PlayerInlineCommon

ORDER = ['player.status', 'player.training', 'player.predicted_return', 'player.allergies']


@tagged('post_install', '-at_install')
class TestHeaderOrder1615(PlayerInlineCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.player.sudo().write({'allergies': 'Synthetic pollen', 'training_recommendation': 'Synthetic rowing',
                                 'predicted_return_date': '2030-02-01'})

    def setUp(self):
        super().setUp()
        self._switch(True)

    @staticmethod
    def _hero_children(tree):
        hero = tree.xpath('//*[@data-sc-section="player.hero"]')[0]
        return [child for child in hero if isinstance(child.tag, str)]

    def _assert_order(self, tree):
        children = self._hero_children(tree)
        sections = [child.get('data-sc-section') for child in children]
        self.assertEqual([s for s in sections if s in ORDER], ORDER, sections)
        # The recommendation is the status block's very next sibling, and
        # « Retour prévu » the recommendation's.
        status = sections.index('player.status')
        self.assertEqual(sections[status + 1], 'player.training', sections)
        self.assertEqual(sections[status + 2], 'player.predicted_return', sections)
        # AC-3: head first, actions last.
        self.assertIn('o_sc_hero_head', children[0].get('class'))
        self.assertIn('o_sc_actions_row', children[-1].get('class'))
        return children

    def test_therapist_order(self):
        self._login_tp()
        _text, tree = self._get(self._url(tab='injuries'))
        children = self._assert_order(tree)
        fields = [c.get('data-sc-section') for c in children]
        status = children[fields.index('player.status')]
        self.assertTrue(status.xpath('.//owl-component[contains(@props, \'"sc_status"\')]'))
        training = children[fields.index('player.training')]
        self.assertTrue(training.xpath('.//owl-component[contains(@props, \'"training_recommendation"\')]'))
        allergies = children[fields.index('player.allergies')]
        self.assertIn('Synthetic pollen', allergies.text_content())

    def test_coach_order(self):
        self._login_coach()
        _text, tree = self._get(self._url(tab='injuries'))
        children = self._assert_order(tree)
        fields = [c.get('data-sc-section') for c in children]
        status = children[fields.index('player.status')]
        self.assertTrue(status.xpath('.//*[@data-sc-section="player.status.readonly"]'))
        training = children[fields.index('player.training')]
        self.assertFalse(training.xpath('.//owl-component'))
        self.assertIn('Synthetic rowing', training.text_content())
        ret = children[fields.index('player.predicted_return')]
        self.assertFalse(ret.xpath('.//owl-component'))
        self.assertIn('2030', ret.text_content())

    def test_fragment_keys_unchanged(self):
        pid = self.player.id
        for login in (self._login_tp, self._login_coach):
            login()
            _text, tree = self._get(self._url(tab='injuries'))
            hero = tree.xpath('//*[@data-sc-section="player.hero"]')[0]
            keys = set(hero.xpath('.//@data-sc-fragment'))
            for part in ('hero-head', 'hero-chips', 'allergies', 'hero-actions'):
                self.assertIn('sports.patient:%s:%s' % (pid, part), keys)
        # Coach-only read fragments.
        self.assertIn('sports.patient:%s:status' % pid, keys)
        self.assertIn('sports.patient:%s:predicted-return' % pid, keys)


@tagged('post_install', '-at_install')
class TestDossierOrder1615(Clinic1540Common):

    def test_clinic_dossier_order(self):
        self._switch(True)
        self._login_tp()
        _text, tree = self._get('/my/clinic/%s?patient=%s&tab=dossier' % (self.clinic.id, self.player.id))
        card = tree.xpath('//*[@data-sc-section="clinic.dossier.status"]')[0]
        fields = card.xpath('.//owl-component/@props')
        self.assertEqual(len(fields), 2, fields)
        self.assertIn('"sc_status"', fields[0])
        self.assertIn('"training_recommendation"', fields[1])
