import unittest
from services.senior_ids import BARANGAY_PREFIXES, format_senior_id

class SeniorIdTests(unittest.TestCase):
    def test_all_barangays_and_aliases(self):
        for name, prefix in BARANGAY_PREFIXES:
            with self.subTest(barangay=name):
                self.assertEqual(format_senior_id({'id':16,'address':f'Block 1, Brgy. {name}, Pateros'}), f'{prefix}-0016')

    def test_preserves_number(self):
        self.assertEqual(format_senior_id({'id':16,'address':'Brgy. Santo Rosario-Silangan, Pateros','osca_id_number':'SA-0099'}), 'SRS-0099')

    def test_unknown_address(self):
        self.assertEqual(format_senior_id({'id':16,'address':'Pateros'}), '')
        self.assertEqual(format_senior_id({}), '')

    def test_long_number_and_word_boundaries(self):
        self.assertEqual(format_senior_id({'id':12345,'address':'Aguho'}), 'AG-12345')
        self.assertEqual(format_senior_id({'id':16,'address':'Notaguho'}), '')

    def test_barangay_takes_priority_over_street(self):
        self.assertEqual(format_senior_id({"id":16,"address":"San Pedro Street, Brgy. Aguho, Pateros"}), "AG-0016")
