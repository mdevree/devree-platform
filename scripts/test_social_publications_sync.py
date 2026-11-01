import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('collector', Path(__file__).with_name('social-publications-sync.py'))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)

class CollectorTests(unittest.TestCase):
    def test_shared_media_requires_unique_object_and_preserves_general_content(self):
        rows = [dict(mediaUrl='same.jpg', realworksId='SE1', scope='property'),
                dict(mediaUrl='same.jpg', realworksId=None, scope='unknown'),
                dict(mediaUrl='same.jpg', realworksId=None, scope='general')]
        enriched = collector.enrich_shared_media(copy.deepcopy(rows))
        self.assertEqual(enriched[1]['realworksId'], 'SE1')
        self.assertIsNone(enriched[2]['realworksId'])
        rows.append(dict(mediaUrl='same.jpg', realworksId='SE2', scope='property'))
        self.assertIsNone(collector.enrich_shared_media(rows)[1]['realworksId'])

    def test_unknown_is_not_silently_general(self):
        self.assertEqual(collector.classify({}, None, 'Een bijzonder uitzicht', None)[0], 'unknown')
        self.assertEqual(collector.classify({}, None, 'Bekijk deze woning op onze website', None)[0], 'property')
        self.assertEqual(collector.classify({}, None, 'Bekijk vragen en antwoorden op onze website', None)[0], 'general')

    def test_catalog_legacy_media_and_visual_override(self):
        meta = collector.catalog_entry({'media': 'https://example.org/photo.jpg', 'scope': 'property', 'realworksId': 'SE11666', 'classificationReason': 'Adres op afbeelding gelezen'})
        self.assertEqual(meta['mediaUrl'], 'https://example.org/photo.jpg')
        self.assertEqual(collector.classify(meta, None, 'Vier slaapkamers', 'SE11666'), ('property', 'Adres op afbeelding gelezen'))

    def test_exact_property_url_without_trailing_slash(self):
        link = 'https://www.devreemakelaardij.nl/aanbod/spijkenisse-test-1'
        p = dict(id='p', integration=dict(id='a', name='De Vree', providerIdentifier='facebook'), state='PUBLISHED', content=link)
        row = collector.build_row(p, {}, {}, {link:'SE1'})
        self.assertEqual(row['realworksId'], 'SE1')
        self.assertEqual(row['scope'], 'property')

if __name__ == '__main__':
    unittest.main()
