# Reading and maintaining the code

This guide explains the first-party source code. Source comments are in English;
the interface and historical reports retain their existing localized text.

## Start with the workflow

1. `index.html` declares the controls. It loads `export-support.js` before
   `frontend.js`; both scripts are deferred until the document is available.
2. `frontend.js` reads ALTO dossiers and posts them to `/api/align`. Import and
   alignment versions prevent earlier responses from replacing newer input.
3. `backend/app.py` parses XML, aligns word streams, optionally asks for semantic
   recovery, and returns review rows together with source metadata and diagnostics.
4. The browser retains a separate result/review for every A-versus-witness pair.
   Review actions change local decisions or editable fragments, not the input XML.
5. Exports either report decisions as JSON, save a reopenable project, or construct
   a TEI document from retained variants. These are three different outputs.

## Source files and responsibilities

| File | Responsibility |
| --- | --- |
| `backend/app.py` | XML parsing, lexical alignment, legacy line alignment, and local HTTP serving |
| `backend/alto_support.py` | XML namespace names, ancestor lookup, and optional taxonomy metadata |
| `backend/automatic_semantic.py` | Weak-window selection and acceptance policy for semantic proposals |
| `backend/semantic_alignment.py` | Lazy Bertalign/LaBSE runtime, bounded inputs, and validated block mapping |
| `backend/relocations.py` | Independent suggestions for possibly displaced passages |
| `frontend.js` | Imports, active-pair state, manual review, images, dialogs, and project persistence |
| `export-support.js` | Pure XML/export logic shared by the browser and Node tests |
| `start.sh` | Local Python environment and dependency setup, then backend startup |
| `LANCER_LINUX.sh` | Compatibility launcher delegating to `start.sh` |
| `reports/bertalign-2026-11-05/reproduce.py` | Optional real-runtime comparison report; it does not mock the model |

## Data contracts: keep the coordinate systems separate

- **Witness:** A is the reference; B, C, and later letters identify comparison
  witnesses. Inside a review row, `bItems` means the comparison side of that pair,
  which may be witness C or later.
- **Source unit:** `{text, refs}`. `text` is the original reading. Each reference
  carries `alto_file`, `page`, `line`, and optional image geometry and taxonomy.
  IDs are local to a file: identify a physical line by file, page, and line together.
- **Review row:** explicit `aItems`/`bItems` fragments plus source-line ranges
  `a0/a1/b0/b1`. These ranges are **zero-based and half-open**. Explicit fragments
  take precedence because text can be corrected, split, moved, or regrouped.
- **Word difference:** `wordDiff` emits offsets into its two input word arrays;
  highlighted tokens refer to a difference through `v`. A decision index is not
  a source-line index or a permanent row identifier.
- **Export edit:** `a0/a1` now count **words in the complete reference stream**,
  not ALTO lines. Equal endpoints represent an insertion. `referenceUnit` owns
  an insertion when several units share a word boundary.
- **Genre range:** user-facing `start/end` values are **one-based and inclusive**
  review-unit numbers. Export helpers convert them to half-open internal ranges.
- **Scores:** `similarity` describes lexical fit. A legacy DP `score` is a path
  objective and must not be displayed or interpreted as a probability.

## State ownership in the browser

`rawByWitness` retains uploaded XML. `pairResults` stores source arrays and edited
alignment fragments for each comparison; `pairReviews` stores variant and movement
choices. The globals `A`, `B`, `groups`, `decisions`, and `movementDecisions` expose
the active pair for rendering. Use `currentReview` when reading all pairs so the
currently edited choices are included even before switching comparisons.

Text corrections live in explicit row fragments. Alignment-editor changes live
in a separate draft until saved. `preserveDecisionsByKey` retains decisions only
for unchanged readings with unchanged sources. Recalculating alignment is a
different operation and can reset the affected reviews after confirmation.

`editedMode` and the explicit edited-input alignment path are retained for older
project/session behavior. That path reads the displayed fragments, not stale
source arrays. A normal full alignment still rebuilds the loaded raw pairs.

Image blob URLs exist only in the browser session. Project snapshots retain
filenames, IIIF fallback values, and associations; local images must be relinked
after reopening. Pending import operations block project replacement and saving
so a snapshot cannot combine two sessions.

## Alignment and semantic recovery

`align_witness_inputs` is the current HTTP entry point. It first runs continuous
word alignment, then applies the acceptance policy in `automatic_semantic`.
The older `align` function remains available for line-based compatibility.

Semantic recovery is optional. Runtime/package/model failure leaves the lexical
result usable and is reported through diagnostics. A proposal must preserve
source readings and references, keep reliable anchors, and improve passage
quality. An accepted proposal remains marked for human review; it does not
automatically mark editorial variants as retained.

Large line comparisons use exact anchors and bounded local tiles instead of an
unbounded matrix. Every input line remains represented, but the result can differ
from the previous full-matrix optimum. Displacement suggestions are a separate
review layer and do not themselves set editorial decisions.

## Exports and persistence

- **Decision JSON** includes each comparison's readings, human-readable source
  labels, variant decisions, semantic diagnostics, and displacement reviews.
- **Project JSON** uses `format: "varians-project"` and `version: 1`. It includes
  original XML, comparison data, settings, and image associations. Validate the
  entire snapshot before replacing live state; keep version-1 compatibility when
  changing internal code.
- **TEI** uses the first computed pair as the common reference and genre-numbering
  basis. Other pairs' retained variants must be rebased onto that reference.
  Deleted targets or oversized divergent spans produce a conflict message rather
  than silently selecting another lemma. Reconcile conflicting A readings before
  retrying export.
- **Poetry TEI** reconstructs physical ALTO lines even when review units have
  been split or regrouped. Source mappings must be unambiguous; do not invent
  line boundaries or discard variants to make an export succeed.

The export dialog edits a draft. Cancelling leaves saved genre settings unchanged;
successful confirmation commits the settings and downloads the document.

## Verification

Run from the repository root:

```sh
python -B -m unittest discover -s tests -p 'test_*.py'
node --test tests/test_export_support.cjs tests/test_witness_import.cjs tests/test_audit_regressions.cjs
node --test tests/test_project_sessions.cjs
```

The browser integration suite requires Playwright and Chromium; `CHROMIUM_PATH`
can select the browser executable. Tests use temporary sessions and deterministic
fixtures. Semantic unit tests simulate the model: passing them does not establish
that real Bertalign/LaBSE dependencies and model downloads work on a given machine.
The report reproduction script can exercise that separate runtime when installed.

When changing behavior, add a regression case at the relevant boundary: source
integrity and API validation in Python; pure exports and request ordering in Node;
visible edit/save/export workflows in Chromium. For documentation-only changes,
also compare executable syntax trees and retain the existing test results.
