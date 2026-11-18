import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app import align, align_alto_words, parse_alto, parse_alto_bundle, similarity
from relocations import find_displaced_passages


def alto(page, line_id, text, tagrefs=''):
    tag=f' TAGREFS="{tagrefs}"' if tagrefs else ''
    return f'''<alto xmlns="http://www.loc.gov/standards/alto/ns-v4#"><Description><sourceImageInformation><fileName>{page}.png</fileName></sourceImageInformation></Description><Layout><Page ID="{page}" WIDTH="1000" HEIGHT="1000"><PrintSpace><TextBlock ID="block-{page}"><TextLine ID="{line_id}" HPOS="10" VPOS="10" WIDTH="500" HEIGHT="20"{tag}><String CONTENT="{text}"/></TextLine></TextBlock></PrintSpace></Page></Layout></alto>'''


class ALTOTests(unittest.TestCase):
    def test_line_ids_are_witness_local_and_not_required_to_match(self):
        a=parse_alto(alto('page-a','line-1','The traveller returned.'), 'a.xml')
        b=parse_alto(alto('page-z','other-id','The traveller returned.'), 'b.xml')
        self.assertEqual(a[0]['text'],b[0]['text'])
        self.assertNotEqual(a[0]['refs'][0]['line'],b[0]['refs'][0]['line'])
        self.assertEqual(align(a,b)[0]['similarity'],1.0)

    def test_text_structure_is_not_an_alignment_input(self):
        xml='<alto><Layout><Page ID="p"><TextBlock ID="b"><TextLine ID="l1"><String CONTENT="First line."/></TextLine><TextLine ID="l2"><String CONTENT="Second line."/></TextLine></TextBlock></Page></Layout></alto>'
        units=parse_alto(xml)
        self.assertEqual([u['text'] for u in units],['First line.','Second line.'])
        self.assertEqual([u['kind'] for u in units],['alto_line','alto_line'])

    def test_line_reconstruction_does_not_depend_on_punctuation(self):
        xml='<alto><Layout><Page ID="p"><TextBlock ID="b"><TextLine ID="l1"><String CONTENT="una bella"/></TextLine><TextLine ID="l2"><String CONTENT="giornata"/></TextLine></TextBlock></Page></Layout></alto>'
        units=parse_alto(xml)
        self.assertEqual(len(units),2)
        self.assertEqual([u['refs'][0]['line'] for u in units],['l1','l2'])

    def test_optional_taxonomy_hints_do_not_block_parse(self):
        xml=alto('p','l','Text.','unknown-tag')
        units=parse_alto(xml)
        self.assertEqual(units[0]['text'],'Text.')
        self.assertEqual(units[0]['refs'][0]['line_tags'][0]['ref'],'unknown-tag')

    def test_moved_passage_is_suggested_between_unmatched_units(self):
        a=[{'text':x,'refs':[]} for x in ['alpha opening sentence.','unique displaced paragraph with several exact words.','omega closing sentence.']]
        b=[{'text':x,'refs':[]} for x in ['alpha opening sentence.','unrelated page one.','unrelated page two.','unique displaced paragraph with several exact words.','omega closing sentence.']]
        groups=align(a,b)
        candidates=find_displaced_passages(a,b,groups,similarity)
        self.assertTrue(any(g['a0'] <= 1 < g['a1'] and g['b0'] <= 3 < g['b1'] for g in groups) or any(c['text_a']==a[1]['text'] and c['text_b']==b[3]['text'] for c in candidates))


    def test_malmantile_title_credit_does_not_drift_into_dedicatory_prose(self):
        samples = Path(__file__).resolve().parents[1] / 'samples'
        paths = sorted((samples / 'Malmantile_II.IV.232').glob('*.xml'))
        reference = parse_alto_bundle([
            {'name': path.name, 'text': path.read_text(encoding='utf-8')} for path in paths
        ])
        path = samples / 'Malmantile_VII.1397' / 'DSC_0237.xml'
        title = parse_alto(path.read_text(encoding='utf-8'), path.name)

        def readings(rows, left, right):
            return [(' '.join(item['text'] for item in row[left]),
                     ' '.join(item['text'] for item in row[right])) for row in rows]

        full = readings(align_alto_words(reference, title), 'aItems', 'bItems')
        self.assertIn(('PERLONE ZIPOLI', 'LORENZO LIPPI'), full)
        self.assertTrue(any("ch'iononneso" in text and not witness for text, witness in full))

        body = [unit for unit in reference if unit['refs'][0]['alto_file'] == 'IMG_20250905_143230.xml']
        for rows, body_side, title_side in [
            (align_alto_words(body, title), 'aItems', 'bItems'),
            (align_alto_words(title, body), 'bItems', 'aItems'),
        ]:
            with self.subTest(body_side=body_side):
                pairs = readings(rows, body_side, title_side)
                self.assertIn(('', 'LORENZO'), pairs)
                self.assertTrue(any("ch'iononneso" in text and not witness for text, witness in pairs))
                self.assertEqual(' '.join(witness for _, witness in pairs if witness),
                                 ' '.join(unit['text'] for unit in title))


    def test_tordi_dedication_separates_unrelated_fragment_and_keeps_supported_reading(self):
        samples = Path(__file__).resolve().parents[1] / 'samples'

        def load(dossier):
            return parse_alto_bundle([
                {'name': path.name, 'text': path.read_text(encoding='utf-8')}
                for path in sorted((samples / f'Malmantile_{dossier}').glob('*.xml'))
            ])

        reference = load('II.IV.232')
        rows = align_alto_words(reference, load('Tordi.386'))
        rejected = [row for row in rows if row.get('lexical_review')]
        self.assertTrue(any(row['aItems'] and not row['bItems'] and
                            'Arciduchessa Claudia' in row['aItems'][0]['text'] for row in rejected))
        self.assertTrue(any(not row['aItems'] and row['bItems'] and
                            row['bItems'][0]['text'] == "scritta dall'" for row in rejected))
        supported = align_alto_words(reference, load('Tordi.435'))
        row = next(row for row in supported if row['aItems'] and 'Arciduchessa Claudia' in row['aItems'][0]['text'])
        self.assertTrue(row['bItems'][0]['text'].startswith('Destinata già'))
        self.assertEqual(row['bItems'][-1]['text'], 'quale')
        self.assertEqual(len({ref['line'] for item in row['bItems'] for ref in item['refs']}), 2)


if __name__=='__main__':
    unittest.main()
