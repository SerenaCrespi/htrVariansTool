"""Regression coverage for source integrity and the alignment API contract."""
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import app
import automatic_semantic
import semantic_alignment


def unit(text, line='l1', filename='page.xml'):
    return {'text': text, 'refs': [{'line': line, 'alto_file': filename, 'page': 'p'}]}


class AuditRegressions(unittest.TestCase):
    def test_repeated_line_ids_keep_distinct_source_files(self):
        rows = app.align_alto_words([unit('alpha beta')],
                                    [unit('alpha', filename='one.xml'), unit('beta', filename='two.xml')])
        self.assertEqual([r['alto_file'] for item in rows[0]['bItems'] for r in item['refs']],
                         ['one.xml', 'two.xml'])

    def test_word_rows_report_actual_source_intervals_and_suffix_position(self):
        rows = app.align_alto_words([unit('alpha beta'), unit('gamma delta', 'l2')],
                                   [unit('alpha beta'), unit('gamma delta', 'l2'), unit('extra suffix', 'l3')])
        self.assertEqual((rows[1]['b0'], rows[1]['b1']), (1, 2))
        self.assertEqual((rows[-1]['a0'], rows[-1]['a1']), (2, 2))

    def test_empty_lines_on_both_sides_retain_source_order_and_references(self):
        a = [unit('alpha'), unit('', 'empty-a'), unit('omega', 'l3')]
        b = [unit('alpha'), unit('', 'empty-b'), unit('omega', 'l3')]
        rows = app.align_alto_words(a, b)
        for key, expected in [('aItems', 'empty-a'), ('bItems', 'empty-b')]:
            refs = [r['line'] for row in rows for item in row[key] for r in item['refs']]
            self.assertIn(expected, refs)
        self.assertEqual([row['a0'] for row in rows], sorted(row['a0'] for row in rows))

    def test_continued_words_cover_both_physical_lines(self):
        rows = app.align_alto_words([unit('splen-', 'l1'), unit('dente', 'l2')],
                                   [unit('splen-', 'l1'), unit('dente', 'l2')])
        self.assertEqual((rows[0]['a0'], rows[0]['a1'], rows[0]['b0'], rows[0]['b1']), (0, 2, 0, 2))

    def test_legacy_compaction_fills_gaps_and_tail(self):
        units = [unit('alpha'), unit('beta', 'l2'), unit('gamma', 'l3')]
        rows = app._compact_alignment_groups([{'a0': 1, 'a1': 2, 'b0': 1, 'b1': 2}], units, units)
        self.assertEqual([(r['a0'], r['a1']) for r in rows], [(0, 1), (1, 2), (2, 3)])

    def test_invalid_nested_payloads_return_json_400(self):
        for payload in [{'alto': None}, {'sentences': []},
                        {'sentences': {'A': [{'text': 'alpha', 'refs': [1]}], 'B': [{'text': 'beta'}]}}]:
            with self.subTest(payload=payload):
                handler = object.__new__(app.Handler)
                body = json.dumps(payload).encode()
                handler.path = '/api/align'
                handler.headers = {'Content-Length': str(len(body))}
                handler.rfile = io.BytesIO(body)
                responses = []
                handler._json = lambda *args: responses.append(args)
                handler.do_POST()
                self.assertEqual(responses[0][0], 400)
                self.assertIn('error', responses[0][1])

    def test_semantic_guard_rejects_anagrams_but_allows_word_relocation(self):
        row = lambda text: {'aItems': [unit('reference')], 'bItems': [unit(text)]}
        self.assertFalse(automatic_semantic._valid_source([row('ab cd')], [row('ac bd')]))
        self.assertTrue(automatic_semantic._valid_source([row('ab cd')], [row('cd ab')]))

    def test_semantic_conservation_allows_continuation_tokens(self):
        self.assertTrue(semantic_alignment._conserved([unit('splen-'), unit('dente')],
                         [{'aItems': [unit('splen-dente')]}], 'aItems'))

    def test_backup_reuses_line_dp_for_transpositions(self):
        with patch.object(app, 'align_alto_words', side_effect=RuntimeError('forced')):
            with patch.object(app, '_align_dp', wraps=app._align_dp) as dp:
                app.align_witness_inputs([unit('alpha beta')], [unit('alpha beta')])
                self.assertEqual(dp.call_count, 1)

    def test_large_line_alignment_preserves_coverage_and_offsets(self):
        a = [unit(f'line {i}', f'l{i}') for i in range(6)]
        b = [unit('preface')] + a
        with patch.object(app, 'MAX_DP_CELLS', 20):
            groups = app._align_dp(a, b, a_offset=10, b_offset=20)
        self.assertEqual([i for g in groups for i in range(g['a0'], g['a1'])], list(range(10, 16)))
        self.assertEqual([i for g in groups for i in range(g['b0'], g['b1'])], list(range(20, 27)))

    def test_invalid_bundle_filename_is_a_validation_error(self):
        with self.assertRaises(ValueError):
            app.parse_alto_bundle([{'name': 1, 'text': '<alto/>'}])

    def test_large_anchor_free_gaps_are_bounded_and_keep_every_line(self):
        with patch.object(app, 'MAX_DP_CELLS', 4):
            rows = app._align_dp([unit('alpha')] * 4, [unit('omega')] * 5)
        self.assertEqual([i for r in rows for i in range(r['a0'], r['a1'])], list(range(4)))
        self.assertEqual([i for r in rows for i in range(r['b0'], r['b1'])], list(range(5)))


if __name__ == '__main__':
    unittest.main()
