import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec=importlib.util.spec_from_file_location('monitor',Path(__file__).with_name('energy-label-monitor.py'))
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class MonitorTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.db=m.open_db(Path(self.tmp.name)/'test.sqlite')
        self.row={'Postcode':'3181AB','Huisnummer':'11','BAGVerblijfsobjectID':'0599010015011208','Gebouwklasse':'W','Registratiedatum':'20261020','Opnamedatum':'20261019','GeldigTot':'20361019','Energieklasse':'C','Status':'Bestaand'}
    def tearDown(self):
        self.db.close();self.tmp.cleanup()
    def signals(self):
        return [json.loads(r[0]) for r in self.db.execute('SELECT payload FROM signals')]
    def test_baseline_and_replay_are_immutable(self):
        label=m.normalize(self.row)
        m.apply_label(self.db,label,'2026-10-20',True,'2026-10-22T08:00:00+00:00')
        m.apply_label(self.db,label,'2026-10-21',False,'2026-10-23T08:00:00+00:00')
        self.assertEqual(len(self.signals()),1)
        self.assertTrue(self.signals()[0]['baseline'])
        self.assertEqual(self.signals()[0]['detectedAt'],'2026-10-22T08:00:00+00:00')
    def test_delete_replace_same_inspection_is_not_new_signal(self):
        label=m.normalize(self.row)
        m.apply_label(self.db,label,'2026-10-20',False,'2026-10-22T08:00:00+00:00')
        m.deactivate(self.db,label['objectKey'])
        label['label']='B'
        m.apply_label(self.db,label,'2026-10-21',False,'2026-10-23T08:00:00+00:00')
        self.assertEqual(len(self.signals()),1)
        self.assertTrue(self.signals()[0]['current'])
        self.assertEqual(self.signals()[0]['label'],'B')
    def test_new_inspection_retains_previous_label(self):
        label=m.normalize(self.row)
        m.apply_label(self.db,label,'2026-10-20',False,'2026-10-22T08:00:00+00:00')
        m.deactivate(self.db,label['objectKey'])
        label=dict(label,inspectedAt='2026-10-21',label='A')
        m.apply_label(self.db,label,'2026-10-22',False,'2026-10-23T08:00:00+00:00')
        signals=self.signals()
        self.assertEqual(len(signals),2)
        self.assertFalse(signals[0]['current'])
        self.assertEqual(signals[1]['previousLabel'],'C')
    def test_region_is_checked_on_actual_bag_place(self):
        self.assertTrue(m.in_area({'gemeentenaam':'Rotterdam','woonplaatsnaam':'Rozenburg'}))
        self.assertFalse(m.in_area({'gemeentenaam':'Haarlemmermeer','woonplaatsnaam':'Rozenburg'}))
        self.assertFalse(m.in_area({'gemeentenaam':'Rotterdam','woonplaatsnaam':'Rotterdam'}))
        self.assertTrue(m.in_area({'gemeentenaam':'Voorne aan Zee'}))
        self.assertIsNone(m.normalize(dict(self.row,Postcode='3011AA')))
    def test_mutation_gap_rolls_back_checkpoint(self):
        monitor=m.Monitor({},Path(self.tmp.name))
        m.state_set(monitor.db,'sequence',10);monitor.db.commit()
        path=Path(self.tmp.name)/'test.zip'
        with zipfile.ZipFile(path,'w') as z:
            z.writestr('test.xml','<Mutatieset><Mutatiebericht><Mutatievolgnummer>12</Mutatievolgnummer><Stuurcode>2</Stuurcode><Pandcertificaat><Postcode>3181AB</Postcode><Huisnummer>11</Huisnummer></Pandcertificaat></Mutatiebericht></Mutatieset>')
        monitor.download=lambda info:path
        with self.assertRaisesRegex(RuntimeError,'Sequence gap'):
            monitor.day({},'2026-10-21',False)
        self.assertEqual(m.state_get(monitor.db,'sequence'),10)
        monitor.db.close()
    def test_unsorted_source_and_snapshot_overlap(self):
        monitor=m.Monitor({},Path(self.tmp.name))
        m.state_set(monitor.db,'sequence',10);monitor.db.commit()
        path=Path(self.tmp.name)/'test.zip'
        messages=''.join('<Mutatiebericht><Mutatievolgnummer>'+str(n)+'</Mutatievolgnummer><Stuurcode>2</Stuurcode><Pandcertificaat><Postcode>3181AB</Postcode><Huisnummer>11</Huisnummer></Pandcertificaat></Mutatiebericht>' for n in [12,9,11,10])
        with zipfile.ZipFile(path,'w') as z:z.writestr('test.xml','<Mutatieset>'+messages+'</Mutatieset>')
        monitor.download=lambda info:path
        monitor.day({},'2026-10-21',False)
        self.assertEqual(m.state_get(monitor.db,'sequence'),12)
        self.assertEqual(m.state_get(monitor.db,'throughDate'),'2026-10-21')
        monitor.db.close()
    def test_calculation_without_label_is_not_a_signal(self):
        self.assertIsNone(m.normalize(dict(self.row,Energieklasse="")))
    def test_date_formats(self):
        self.assertEqual(m.date_value('20261022'),'2026-10-22')
        self.assertEqual(m.date_value('01-10-2026'),'2026-10-01')
        with self.assertRaises(ValueError):m.date_value('nonsense')

if __name__=='__main__':unittest.main()
