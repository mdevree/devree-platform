import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import reception as r

class QueueTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.previous=r.ROOT
        r.ROOT=Path(self.tmp.name)
        self.c=r.db()
    def tearDown(self):
        self.c.close()
        r.ROOT=self.previous
        self.tmp.cleanup()
    def test_durable_before_ack_and_two_calls(self):
        r.save_call(self.c,'a','callback','+31612345678',r.now())
        r.save_call(self.c,'b','callback',None,r.now())
        reopened=r.db()
        self.assertEqual(reopened.execute('SELECT count(*) FROM calls').fetchone()[0],2)
        self.assertEqual(reopened.execute('SELECT acknowledged FROM calls WHERE id="a"').fetchone()[0],0)
        reopened.close()
    def test_revisions_preserve_latest_and_consent(self):
        received=r.now();consent=r.now()
        r.save_call(self.c,'a','callback','+31612345678',received)
        e=r.save_call(self.c,'a','callback','+31612345678',received,consent,True)
        self.assertEqual(e['eventId'],'a:2')
        self.assertEqual(e['consentAt'],consent)
        self.assertEqual(self.c.execute('SELECT finalized FROM calls').fetchone()[0],1)
    def test_offline_retains_event_and_recording(self):
        ident='a'*40
        r.save_call(self.c,ident,'callback','+31612345678',r.now(),finalized=True)
        p=r.ROOT/'recordings'/f'{ident}.wav';p.write_bytes(b'0'*2000)
        with patch.object(r,'api',side_effect=OSError),patch.object(r.subprocess,'run',side_effect=OSError):
            self.assertGreater(r.sync_once(self.c),0)
        self.assertEqual(self.c.execute('SELECT acknowledged FROM calls').fetchone()[0],0)
        self.assertTrue(p.exists())
    def test_ack_upload_and_retention(self):
        ident='b'*40;r.save_call(self.c,ident,'callback','+31612345678',r.now(),finalized=True)
        p=r.ROOT/'recordings'/f'{ident}.wav';p.write_bytes(b'0'*2000)
        paths=[]
        def api(path,*args):
            paths.append(path)
            if path=='config':return {'config':{'version':2}}
            if path=='events':return {'stored':True,'requestId':'request'}
            if path.endswith('/recording'):return {'stored':True}
            return {'deleteRecordings':[ident,'../../escape']}
        with patch.object(r,'api',side_effect=api),patch.object(r.subprocess,'run',side_effect=OSError):
            r.sync_once(self.c)
        self.assertEqual(paths,['config','events','requests/request/recording','heartbeat'])
        self.assertEqual(self.c.execute('SELECT uploaded FROM calls').fetchone()[0],1)
        self.assertFalse(p.exists())
    def test_new_revision_not_lost_during_network_request(self):
        received=r.now();r.save_call(self.c,'a','callback',None,received)
        def api(path,*args):
            if path=='config':return {'config':{'version':1}}
            if path=='events':
                r.save_call(self.c,'a','callback',None,received,finalized=True)
                return {'stored':True,'requestId':'request'}
            return {}
        with patch.object(r,'api',side_effect=api),patch.object(r.subprocess,'run',side_effect=OSError):r.sync_once(self.c)
        row=self.c.execute('SELECT * FROM calls').fetchone()
        self.assertEqual(row['acknowledged'],0)
        self.assertEqual(json.loads(row['payload'])['revision'],2)

class RoutingTest(unittest.TestCase):
    def test_numbers(self):
        self.assertEqual(r.phone('0612345678'),'+31612345678')
        for value in ['anonymous','201','+310612345678','../abc']:
            self.assertIsNone(r.phone(value))
    def test_away_expiry_and_closed(self):
        cfg={'mode':'away','awayUntil':'2026-09-18T10:00:00Z'}
        self.assertEqual(r.mode(cfg,dt.datetime.fromisoformat('2026-09-18T09:59:00+00:00')),'away')
        self.assertEqual(r.mode(cfg,dt.datetime.fromisoformat('2026-09-18T10:00:00+00:00')),'available')
        self.assertEqual(r.mode(cfg,dt.datetime.fromisoformat('2026-09-20T10:00:00+00:00')),'closed')

if __name__=='__main__':unittest.main()

class CallFlowTest(QueueTest):
    def flow(self, choices, hangup_record=False, record=True, caller='0612345678'):
        played=[];owner=self
        class FakeAGI:
            env={'agi_uniqueid':'test-unique','agi_callerid':caller,'agi_arg_1':'menu'}
            def read(self,name,digits=1):
                played.append(name)
                choice=next(choices)
                if choice is None:raise r.HungUp()
                return choice
            def command(self,command):return (0,'')
            def number(self,current):return current
            def play(self,name):
                played.append(name)
                if name=='callback-saved':
                    row=owner.c.execute('SELECT * FROM calls').fetchone()
                    owner.assertIsNotNone(row)
                    owner.assertEqual(json.loads(row['payload'])['kind'],'callback')
            def record(self,call_id):
                if record:(r.ROOT/'recordings'/f'{call_id}.wav').write_bytes(b'0'*2000)
                if hangup_record:raise r.HungUp()
        with patch.object(r,'AGI',FakeAGI),patch.object(r.signal,'signal'):
            r.run_agi()
        return played,json.loads(self.c.execute('SELECT payload FROM calls').fetchone()[0])
    def test_callback_saved_before_confirmation_and_hangup_keeps_recording(self):
        played,payload=self.flow(iter(['1','1']),True)
        self.assertIn('callback-saved',played);self.assertTrue(payload['consentAt'])
        self.assertTrue(r.has_recording(payload['callId']))
    def test_hangup_during_consent_keeps_request_without_send(self):
        _,payload=self.flow(iter(['1',None]))
        self.assertEqual(payload['kind'],'callback');self.assertIsNone(payload['consentAt'])
    def test_no_choice_no_recording_is_only_missed(self):
        _,payload=self.flow(iter(['','']),record=False)
        self.assertEqual(payload['kind'],'missed')
    def test_no_choice_with_recording_creates_callback_without_whatsapp(self):
        _,payload=self.flow(iter(['','']))
        self.assertEqual(payload['kind'],'callback');self.assertIsNone(payload['consentAt'])
    def test_hangup_in_main_is_missed(self):
        _,payload=self.flow(iter([None]),record=False)
        self.assertEqual(payload['kind'],'missed')
    def test_viewing_without_consent_has_no_send(self):
        _,payload=self.flow(iter(['2','2']))
        self.assertEqual(payload['kind'],'viewing');self.assertIsNone(payload['consentAt'])
