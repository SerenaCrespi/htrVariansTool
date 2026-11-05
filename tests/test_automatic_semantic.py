"""Automatic fallback policy tests; model proposals are controlled substitutes."""
import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import automatic_semantic as automatic
import app


def item(text, key):
    return {'text': text, 'refs': [{'alto_file': 'test.xml', 'page': 'p', 'line': key}]}


def row(a, b, key):
    return {'id': key, 'a0': 0, 'a1': 1 if a else 0, 'b0': 0, 'b1': 1 if b else 0,
            'aItems': [item(a, 'a'+str(key))] if a else [],
            'bItems': [item(b, 'b'+str(key))] if b else [], 'similarity': 0}


def gap_passage(prefix=''):
    text = 'the displaced passage has several clearly matching words'
    return [row('stable opening context remains exactly matched', 'stable opening context remains exactly matched', prefix+'0'),
            row(text, '', prefix+'1'), row('', text, prefix+'2'),
            row('stable closing context remains exactly matched', 'stable closing context remains exactly matched', prefix+'3')]


def improved(rows):
    middle = {**copy.deepcopy(rows[1]), 'bItems': copy.deepcopy(rows[2]['bItems']), 'similarity': 1}
    return [copy.deepcopy(rows[0]), middle, copy.deepcopy(rows[3])]


def proposal(value):
    return {'status': 'proposal_ready', 'engine': 'bertalign', 'alignments': value}


def separated_passages(count):
    rows = []
    for i in range(count):
        if rows:
            rows.append(row('reliable separator one two three', 'reliable separator one two three', f's{i}'))
        rows.extend(gap_passage(str(i)))
    return rows


class AutomaticSemanticTests(unittest.TestCase):
    def recover(self, rows, proposer):
        return automatic.recover(rows, app.align_alto_words, app.similarity, proposer)

    def test_good_lexical_matches_do_not_load_or_call_bertalign(self):
        rows = [row('one reliable passage with context', 'one reliable passage with context', i) for i in range(3)]
        proposer = Mock()
        actual, diagnostic = self.recover(rows, proposer)
        self.assertIs(actual, rows)
        self.assertEqual(diagnostic['status'], 'not_needed')
        proposer.assert_not_called()

    def test_short_variants_and_real_one_sided_additions_do_not_trigger_recovery(self):
        rows = gap_passage()
        for middle in [[row('a', 'z', 9)], [row('', 'a genuine extra passage with many words', 8)]]:
            proposer = Mock()
            actual, diagnostic = self.recover([rows[0], *middle, rows[3]], proposer)
            self.assertEqual(diagnostic['status'], 'not_needed')
            proposer.assert_not_called()

    def test_partial_matches_still_trigger_recovery_on_contrasted_gaps(self):
        rows = gap_passage()
        before = copy.deepcopy(rows)
        proposer = Mock(return_value=proposal(improved(rows)))
        actual, diagnostic = self.recover(rows, proposer)
        proposer.assert_called_once()
        self.assertEqual(diagnostic['status'], 'applied')
        self.assertEqual(diagnostic['accepted'], 1)
        self.assertEqual(len(actual), 3)
        self.assertTrue(all(r['semantic_review'] for r in actual))
        self.assertTrue(all(r['alignment_source'] == 'bertalign_automatic' for r in actual))
        self.assertEqual(rows, before)

    def test_consecutive_low_similarity_matches_trigger_even_without_empty_rows(self):
        text_a = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh'
        text_b = 'zzzz yyyy xxxx wwww vvvv uuuu tttt ssss'
        rows = [row(text_a, text_b, i) for i in range(2)]
        proposer = Mock(return_value={'status': 'no_correspondence'})
        _, diagnostic = self.recover(rows, proposer)
        proposer.assert_called_once()
        self.assertEqual(diagnostic['attempted'], 1)
        self.assertEqual(diagnostic['status'], 'kept_lexical')

    def test_single_long_uncertain_passage_can_trigger(self):
        rows = [row(' '.join(['alpha']*12), ' '.join(['zulu']*12), 0)]
        proposer = Mock(return_value={'status': 'not_installed'})
        _, diagnostic = self.recover(rows, proposer)
        proposer.assert_called_once()
        self.assertEqual(diagnostic['status'], 'not_installed')

    def test_model_and_dependency_errors_keep_lexical_output_exactly(self):
        for status in ['not_installed', 'model_unavailable', 'dependency_unavailable', 'alignment_failed', 'invalid_mapping', 'refinement_failed']:
            with self.subTest(status=status):
                rows = gap_passage()
                actual, diagnostic = self.recover(rows, Mock(return_value={'status': status}))
                self.assertIs(actual, rows)
                self.assertEqual(diagnostic['accepted'], 0)
                self.assertEqual(diagnostic['windows'][0]['status'], status)

    def test_repeated_windows_do_not_retry_a_failed_runtime(self):
        rows = separated_passages(3)
        proposer = Mock(return_value={'status': 'model_unavailable'})
        actual, diagnostic = self.recover(rows, proposer)
        proposer.assert_called_once()
        self.assertIs(actual, rows)
        self.assertEqual(diagnostic['windows'][1]['status'], 'not_attempted_after_failure')

    def test_unchanged_or_worse_proposals_are_rejected(self):
        rows = gap_passage()
        bad = copy.deepcopy(rows)
        for r in bad:
            r['similarity'] = 1  # Reported scores cannot bypass recomputed quality.
        actual, diagnostic = self.recover(rows, Mock(return_value=proposal(bad)))
        self.assertIs(actual, rows)
        self.assertEqual(diagnostic['windows'][0]['status'], 'no_improvement')

    def test_source_text_or_reference_loss_is_rejected(self):
        rows = gap_passage()
        for damage in ['text', 'refs']:
            bad = improved(rows)
            if damage == 'text':
                bad[1]['aItems'][0]['text'] = 'lost text'
            else:
                bad[1]['aItems'][0]['refs'] = []
            actual, diagnostic = self.recover(rows, Mock(return_value=proposal(bad)))
            self.assertIs(actual, rows)
            self.assertEqual(diagnostic['windows'][0]['status'], 'source_changed')

    def test_existing_reliable_context_cannot_be_regrouped_by_semantic_recovery(self):
        rows = gap_passage()
        good = improved(rows)
        merged = {**good[0], 'aItems': good[0]['aItems']+good[1]['aItems'], 'bItems': good[0]['bItems']+good[1]['bItems']}
        actual, diagnostic = self.recover(rows, Mock(return_value=proposal([merged, good[2]])))
        self.assertIs(actual, rows)
        self.assertEqual(diagnostic['windows'][0]['status'], 'anchor_changed')

    def test_attempt_budget_and_oversized_windows_are_reported(self):
        rows = separated_passages(4)
        proposer = Mock(side_effect=lambda selected, refine: proposal(selected))
        _, diagnostic = self.recover(rows, proposer)
        self.assertEqual(proposer.call_count, automatic.MAX_ATTEMPTS)
        self.assertEqual(diagnostic['windows'][-1]['status'], 'attempt_limit')
        long_rows = [row(' '.join(['alpha']*12), ' '.join(['zulu']*12), i) for i in range(41)]
        proposer.reset_mock()
        actual, diagnostic = self.recover(long_rows, proposer)
        proposer.assert_not_called()
        self.assertIs(actual, long_rows)
        self.assertEqual(diagnostic['status'], 'limit_reached')

    def test_unexpected_errors_and_input_limits_do_not_break_the_alignment(self):
        for error, status in [(RuntimeError('failure'), 'alignment_failed'), (ValueError('limit'), 'input_limit')]:
            rows = gap_passage()
            actual, diagnostic = self.recover(rows, Mock(side_effect=error))
            self.assertIs(actual, rows)
            self.assertEqual(diagnostic['windows'][0]['status'], status)

    def test_alignment_entrypoint_runs_automatic_recovery_and_exposes_diagnostics(self):
        rows = gap_passage()
        a = [i for r in rows for i in r['aItems']]
        b = [i for r in rows for i in r['bItems']]
        with patch.object(app, 'align_alto_words', return_value=rows), patch.object(automatic.semantic_alignment, 'propose', return_value=proposal(improved(rows))) as call:
            actual, method, _, diagnostic = app.align_witness_inputs(a, b, include_diagnostics=True)
        call.assert_called_once()
        self.assertEqual(diagnostic['status'], 'applied')
        self.assertTrue(method.startswith('hybrid: automatic'))
        self.assertEqual(len(actual), 3)

    def test_malformed_engine_responses_are_rejected_without_breaking_alignment(self):
        for response in [None, [], {}, {'status': None}]:
            rows = gap_passage()
            actual, diagnostic = self.recover(rows, Mock(return_value=response))
            self.assertIs(actual, rows)
            self.assertEqual(diagnostic['windows'][0]['status'], 'invalid_mapping')

    def test_quality_diagnostics_include_the_improvement_and_runtime_limits(self):
        rows = gap_passage()
        _, diagnostic = self.recover(rows, Mock(return_value=proposal(improved(rows))))
        result = diagnostic['windows'][0]
        self.assertGreaterEqual(result['afterQuality']-result['beforeQuality'], automatic.MIN_GAIN)
        self.assertEqual(diagnostic['policy']['maxWindowUnits'], 40)


if __name__ == '__main__':
    unittest.main()
