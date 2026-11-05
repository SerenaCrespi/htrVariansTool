"""Control-flow tests use a fake encoder/aligner, never downloaded model weights."""
import copy
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import semantic_alignment as semantic
from app import align_alto_words, align_witness_inputs


def item(text, line):
    return {'text': text, 'refs': [{'alto_file': 'source.xml', 'page': 'p', 'line': line, 'coords': '1,2,3,4'}]}


def rows():
    return [{'aItems': [item(f'alpha {i}', f'a{i}')], 'bItems': [item(f'beta {i}', f'b{i}')]} for i in range(4)]


class FakeAligner:
    beads = [([0], [0]), ([1], [1])]
    calls = []

    def __init__(self, left, right, **kwargs):
        self.calls.append((left, right, kwargs))

    def align_sents(self):
        self.result = copy.deepcopy(self.beads)


class SemanticTests(unittest.TestCase):
    def setUp(self):
        self.old_runtime, self.old_status = semantic._RUNTIME, semantic._LAST_STATUS
        semantic._RUNTIME = semantic._LAST_STATUS = None
        FakeAligner.calls = []
        FakeAligner.beads = [([0], [0]), ([1], [1])]

    def tearDown(self):
        semantic._RUNTIME, semantic._LAST_STATUS = self.old_runtime, self.old_status

    def run_fake(self, value=None, refine=align_alto_words):
        with patch.object(semantic, '_load_runtime', return_value=(FakeAligner, 'shared-encoder')):
            return semantic.propose(rows() if value is None else value, refine)

    def test_missing_package_does_not_run_or_claim_lexical_fallback(self):
        refine = Mock()
        with patch.object(semantic, '_load_runtime', side_effect=ModuleNotFoundError(name='bertalign')):
            result = semantic.propose(rows(), refine)
        self.assertEqual(result['status'], 'not_installed')
        self.assertNotIn('alignments', result)
        refine.assert_not_called()

    def test_missing_dependency_and_model_failures_are_distinct_and_retryable(self):
        for error, expected in [(ModuleNotFoundError(name='torch'), 'dependency_unavailable'),
                                (SyntaxError('unsupported Python'), 'dependency_unavailable'),
                                (OSError('model unavailable'), 'model_unavailable')]:
            with self.subTest(expected=expected), patch.object(semantic, '_load_runtime', side_effect=error):
                self.assertEqual(semantic.propose(rows(), Mock())['status'], expected)
        self.assertEqual(self.run_fake()['status'], 'proposal_ready')

    def test_proposal_uses_context_blocks_shared_encoder_and_preserves_all_alto_refs(self):
        original = rows()
        saved = copy.deepcopy(original)
        result = self.run_fake(original)
        self.assertEqual(result['status'], 'proposal_ready')
        self.assertEqual(result['semantic_blocks'], {'A': 2, 'B': 2})
        self.assertEqual(len(FakeAligner.calls[0][0].splitlines()), 2)
        self.assertEqual(FakeAligner.calls[0][2]['model'], 'shared-encoder')
        self.assertTrue(FakeAligner.calls[0][2]['is_split'])
        self.assertEqual(original, saved)
        for key in ('aItems', 'bItems'):
            expected = [ref for row in original for unit in row[key] for ref in unit['refs']]
            actual = [ref for row in result['alignments'] for unit in row[key] for ref in unit['refs']]
            self.assertEqual(actual, expected)

    def test_incomplete_duplicate_nonmonotonic_and_out_of_bounds_indices_are_rejected(self):
        for bad in [[], [([0], [0])], [([1], [0]), ([0], [1])], [([0, 0], [0, 1])],
                    [([0, 1, 2], [0, 1])], [([True], [0]), ([1], [1])]]:
            with self.subTest(beads=bad):
                FakeAligner.beads = bad
                refine = Mock()
                result = self.run_fake(refine=refine)
                self.assertEqual(result['status'], 'invalid_mapping')
                refine.assert_not_called()

    def test_pure_omissions_and_additions_do_not_claim_correspondence(self):
        FakeAligner.beads = [([0, 1], []), ([], [0, 1])]
        self.assertEqual(self.run_fake()['status'], 'no_correspondence')

    def test_one_to_many_mapping_refines_only_within_semantic_spans(self):
        FakeAligner.beads = [([0], [0, 1]), ([1], [])]
        refine = Mock(wraps=align_alto_words)
        self.assertEqual(self.run_fake(refine=refine)['status'], 'proposal_ready')
        self.assertEqual([len(c.args[0]) for c in refine.call_args_list], [2, 2])
        self.assertEqual([len(c.args[1]) for c in refine.call_args_list], [4, 0])

    def test_alignment_failure_and_lossy_refinement_are_not_returned_as_proposals(self):
        with patch.object(FakeAligner, 'align_sents', side_effect=RuntimeError('failed')):
            self.assertEqual(self.run_fake()['status'], 'alignment_failed')
        self.assertEqual(self.run_fake(refine=lambda a, b: [])['status'], 'refinement_failed')

    def test_invalid_empty_oversized_and_one_sided_requests_fail_before_loading_model(self):
        for value in [None, [], [{}], [{'aItems': [], 'bItems': []}], rows() * 11,
                      [{'aItems': [item('a', 'a')], 'bItems': []}],
                      [{'aItems': [item('x' * 100001, 'a')], 'bItems': [item('b', 'b')]}]]:
            with self.subTest(value_type=type(value)), patch.object(semantic, '_load_runtime') as load:
                with self.assertRaises(ValueError):
                    semantic.propose(value, Mock())
                load.assert_not_called()

    def test_runtime_status_does_not_load_the_model(self):
        with patch.object(semantic.importlib.util, 'find_spec', return_value=object()), patch.object(semantic, '_load_runtime') as load:
            self.assertEqual(semantic.runtime_status()['status'], 'available_not_loaded')
            load.assert_not_called()

    def test_real_loader_reuses_the_encoder_between_requests(self):
        get_encoder = Mock(return_value='one-encoder')
        package = types.ModuleType('bertalign')
        package.Bertalign = FakeAligner
        encoder = types.ModuleType('bertalign.encoder')
        encoder.get_encoder = get_encoder
        with patch.dict(sys.modules, {'bertalign': package, 'bertalign.encoder': encoder}):
            self.assertEqual(semantic.propose(rows(), align_alto_words)['status'], 'proposal_ready')
            self.assertEqual(semantic.propose(rows(), align_alto_words)['status'], 'proposal_ready')
        get_encoder.assert_called_once_with()
        self.assertEqual(len(FakeAligner.calls), 2)

    def test_normal_lexical_matches_do_not_implicitly_call_the_semantic_model(self):
        a = [item('the same words', 'a')]
        b = [item('the same words', 'b')]
        with patch.object(semantic, '_load_runtime') as load:
            aligned, method, _ = align_witness_inputs(a, b)
        self.assertTrue(aligned)
        self.assertTrue(method.startswith('word-level'))
        load.assert_not_called()


if __name__ == '__main__':
    unittest.main()
