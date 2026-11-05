import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app import align, parse_alto, similarity
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


if __name__=='__main__':
    unittest.main()
