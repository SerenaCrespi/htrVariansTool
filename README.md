# HTRVariansTool

A local application for comparing manuscript witnesses transcribed in ALTO XML.
HTRVariansTool aligns words against a reference witness, lets researchers review and
correct the proposed correspondences, and exports decisions as JSON or a TEI
text with a critical apparatus. Up to **10 witnesses** are supported, including
the reference.

The browser interface is available in English, French and Italian. ALTO
processing runs on the local Python backend; local page images are read by the
browser. An optional IIIF image URL accesses the remote image provider.

## Start the application

Run commands from the repository directory. Python **3.12 or newer** is
recommended and is required by the launcher’s Bertalign setup.

### Standard workflow without installing optional models

The main ALTO alignment workflow uses the Python standard library:

```bash
python3 backend/app.py
```

This works on Linux and macOS with a suitable Python installation. The backend
opens the browser and prints its local address, normally
`http://127.0.0.1:5010`. If that port is occupied, use the alternative address
printed in the terminal. Keep the terminal open; stop the app with **Ctrl+C**.

Do not open `index.html` directly: the interface needs the backend for alignment
and static files.

### Linux launcher with Bertalign dependencies

On Ubuntu versions providing Python 3.12:

```bash
sudo apt install python3.12 python3.12-venv
sh LANCER_LINUX.sh
```

The launcher creates `.venv/` and installs Bertalign and CPU PyTorch on the first
run. These downloads can be large. Bertalign is optional for the main ALTO
workflow, but the current launcher installs it automatically. To avoid these
downloads, use the direct Python command above.

There is currently no macOS-specific launcher in this checkout; use the direct
Python command on macOS.

### Update an existing checkout

The save/resume and export improvements are included in **`main`**. To update:

```bash
git fetch origin
git switch main
git pull --ff-only
```

Preserve any local changes before switching branches. After updating, stop and
restart the Python backend, then refresh the browser with **Ctrl+Shift+R**
(**Cmd+Shift+R** on macOS).

## Review workflow

1. Select the reference witness’s ALTO files and enter its witness name.
2. Click **Add a witness**, select its ALTO files, and enter its name. Repeat for
   additional witnesses, up to nine besides the reference. Alignment starts when
   the required files are loaded; **Align text units** can recalculate it.
3. Optionally select the local page images for each witness or enter a IIIF image
   URL. Open the source comparison to inspect readings against the facsimiles.
4. Select a witness comparison. Review the proposed variants with **Keep** or
   **Ignore**, correct transcriptions with **Edit text**, and use **Adjust
   alignment** to move or split line fragments.
5. Review possible displaced passages separately. They are suggestions requiring
   scholarly verification.
6. Save a resumable project and/or export the results.

Review units are interface rows. They can contain multiple ALTO lines or only a
fragment of one line; they are not automatically paragraphs or verses.
Saving an **Edit text** correction recalculates differences only for that unit.
Decisions in other units and other witness comparisons are preserved. The app
asks before resetting existing decisions in the edited unit. Saving without
changing either reading keeps all decisions and source groupings intact.
Recalculating the complete alignment can clear review decisions, so save the
project before doing that.

## Automatic Bertalign fallback

On the `feature/project-save-open` branch, Bertalign is an **automatic backend
fallback** during ALTO import and complete realignment. There is no semantic
button or proposal-application dialog. Ordinary spelling variants and reliable
matches continue through the lexical workflow without loading a model.

1. The backend first aligns the continuous word streams lexically.
2. It detects consecutive weak matches or contrasted additions/omissions and
   includes nearby context. A long uncertain unit can also trigger recovery.
3. It attempts Bertalign on eligible passages and refines the semantic passage
   correspondences with word-level lexical alignment.
4. It accepts a replacement only if all source text/references are retained,
   reliable contextual correspondences stay intact, and measured lexical
   alignment quality improves. Otherwise the lexical result is kept.
5. The interface reports whether fallback was unnecessary, unavailable,
   attempted without an accepted improvement, or applied. Recovered units are
   marked **automatic Bertalign recovery: review this unit** and appear under
   **Uncertain alignments**. No editorial keep/ignore decisions are automatic.

This runs before review begins, not every time **Edit text** is saved and not
when reopening a saved project. The existing preservation of decisions during
local text edits is unchanged. A complete realignment still asks before clearing
review decisions.

### Runtime and first use

Bertalign 2.0.1 requires Python 3.12+ and the dependencies in `requirements.txt`.
The Linux launcher installs them into `.venv`. If installing manually, use the
same Python environment that starts the server. The first eligible passage
loads the public **LaBSE** model and may download its weights from Hugging Face.
Sufficient memory and network access to the model host are required. The loaded
encoder is reused for subsequent passages.

A missing package, incompatible dependency, failed model load or rejected output
never replaces the lexical result. The reason is shown in the interface. Model
loading is not attempted on comparisons that have no eligible uncertain passage.

### Recovery policy and limits

The current policy is deliberately explicit and experimental:

- A weak row has recomputed lexical similarity below **0.45** or text on only
  one side. A core needs text from both witnesses and at least two weak rows,
  or one weak row with at least 12 words on each side. Isolated short variants
  and pure one-sided additions do not trigger the model.
- One neighboring row on each side provides context. Each side of the complete
  window needs at least 8 words. Overlapping windows are combined.
- Up to **3 windows per comparison** are attempted, with **40 review units** per
  window and the semantic adapter’s fragment/character limits. Oversized windows
  and exhausted budgets are recorded instead of silently truncated.
- Existing correspondences scoring at least **0.65** must remain intact. Quality
  is the sum of paired-word counts weighted by lexical similarity, divided by
  the larger witness word count. It must improve by at least **0.04**. Reported
  proposal scores alone cannot bypass this check.
- A runtime failure stops further attempts in that comparison. Remaining windows
  are recorded as unattempted; they retain their lexical alignment.

Project files retain the fallback diagnostics and provenance of recovered rows.
Decisions JSON exports include `semanticFallback`, `alignmentSource` and
`requiresReview`. Diagnostic window numbers refer to the initial lexical rows,
before any replacement changes the row count.

These heuristics require calibration on researcher-reviewed manuscripts. A
semantic correspondence that does not improve the lexical score is currently
rejected. Unit tests use a controlled aligner/encoder: they verify activation,
validation and safe fallback, **not LaBSE’s scholarly accuracy**. Actual model
inference must be evaluated separately on real passages.

## Save, reopen and export

| Action | File | Purpose |
|---|---|---|
| **Save project** | `varians-project.json` | Resume the complete editing session later |
| **Open project** | A saved project JSON | Restore the session without recalculating alignment |
| **Export decisions JSON** | Localized JSON filename | Use the reviewed results and structure settings outside the app |
| **Export full TEI text** | Localized XML filename | Export the text with retained variants and the selected TEI structure |

Downloads normally go to the browser’s **Downloads** folder; browser settings may
ask where to save them. Files are not uploaded to GitHub.

### Resumable projects

A project includes the original ALTO XML, all witness comparisons, saved text
corrections, manual line groupings, variant and displaced-passage decisions,
witness names, IIIF URLs, view settings and the confirmed TEI structure settings.
Finish or cancel any open text/alignment edit before saving. You can save before
alignment as well.

**There is no automatic saving or recovery yet.** Click **Save project** before
closing or refreshing the page, and keep the latest downloaded file. Saving again
may create another browser download rather than overwrite the previous file.

**Open project** asks before replacing an existing session. Invalid files,
unsupported format versions and files larger than 100 MB are rejected without
replacing the current session. A decisions JSON export is not a resumable project.

Local image files are **not embedded**. Reselect them for each witness after
opening a project; manual associations reconnect by filename. Use unique image
filenames within each witness. IIIF URLs are retained. The project contains
manuscript text and editorial decisions, so share it accordingly.

## Configure the TEI export

Click **Export full TEI text** to open a dialog. Nothing downloads until you click
**Download TEI**. Choose either:

- **One genre for the whole text**: prose, poetry or drama.
- **Different genres by interval**: specify **From unit**, **To unit** and the
  genre for each interval.

For example:

| From unit | To unit | Genre |
|---|---|---|
| 1 | 12 | Prose |
| 13 | 28 | Poetry |
| 29 | 45 | Prose |

The first interval initially covers the complete text. Change its end before
clicking **Add interval**. Cover all units once, in order, without gaps or
overlaps. Invalid intervals keep the dialog open with an explanation.

Numbering follows the reference units in the **first witness comparison**, named
in the dialog. Expand **Reference unit numbering and source lines** to see the
numbered readings and their ALTO references, particularly when viewing another
comparison.

### How the text is structured

- **Prose:** all review units in one prose interval are joined into a single
  `<p>`. Separate prose intervals can define separate paragraphs.
- **Poetry:** one `<l>` is generated for each original ALTO line of the reference
  witness, within `<lg type="poem">`. Grouping several lines into one review unit
  does not merge their verses; splitting a source line into multiple review
  fragments does not create extra verses. Continued words are mapped back to
  their physical source lines.
- **Drama:** each interval is exported as `<sp><p>…</p></sp>`. Speakers and stage
  directions are not inferred automatically.

ALTO line identity includes the file, page and line ID. A poetry interval must
include all review fragments of the source lines it contains. If reference
corrections make the original line boundaries ambiguous, or a retained variant
crosses a verse/structure boundary, export reports the issue rather than dropping
the variant or inventing a boundary. Adjust the corrections or intervals before
retrying. Stanzas and paragraph boundaries are not inferred automatically.

**Download TEI** confirms the structure settings for future exports and project
saves. **Cancel** or **Esc** discards changes made in the dialog. Save the project
after confirming if you want to retain the settings between sessions. Earlier
projects without interval settings still open using their saved uniform genre.
The decisions JSON also includes the confirmed intervals.

### Witness identifiers in JSON and TEI

Exported witness IDs derive from the names assigned during import, with the same
IDs used in JSON, TEI `<witness xml:id="…">` and all apparatus `wit` references.

| Assigned name | Exported ID |
|---|---|
| `Tordi.435` | `Tordi.435` |
| `BNCF II.IV.232` | `BNCF_II.IV.232` |
| `232 Firenze` | `witness_232_Firenze` |

Characters incompatible with XML identifiers become underscores. Duplicate or
normalization-colliding IDs receive `_2`, `_3`, etc. Original display names are
retained, and the dialog previews the exported IDs. Resumable project files keep
internal comparison keys; those differ from public result-export identifiers.

## Alignment approach

- ALTO lines are flattened into each witness’s ordered word stream.
- Shared word sequences provide anchors; weighted word-level Levenshtein aligns
  intervening spans.
- Results retain their ALTO source references for review and export.
- Bertalign is not required for the main ALTO alignment. It can be attempted by
  the backup/legacy alignment path; the normal API now uses it for
  automatic recovery of uncertain passages on the feature branch.
  Displaced-passage suggestions are separate review aids.

All alignments are proposals for scholarly review, not automatic editorial
judgments. See [the backend documentation](backend/README.md) for more detail.

## Tests

Run from the repository directory.

### Backend

```bash
python3 -B -m unittest discover -s tests -v
```

### Export unit tests

Requires Node.js 20 or newer; no browser dependencies are needed:

```bash
node --test tests/test_export_support.cjs
```

Coverage includes name-based witness IDs, collisions, complete text preservation,
mixed genres, ALTO line reconstruction, continued words, apparatus placement,
and invalid intervals or ambiguous boundaries. Backend tests cover automatic
activation on uncertain passages, quality gates, reliable-context protection,
text/reference conservation, budgets, unavailable models and encoder reuse with
a controlled Bertalign substitute.

### Browser regression tests

Requires Node.js, Playwright and a Chromium executable. If Playwright is not
already installed, install it outside the checkout:

```bash
npm install --prefix /tmp/varians-browser-tests playwright
NODE_PATH=/tmp/varians-browser-tests/node_modules node --test tests/test_project_sessions.cjs
```

If Playwright is already available:

```bash
node --test tests/test_project_sessions.cjs
```

Tests use `/usr/bin/chromium` by default. Set `CHROMIUM_PATH` to an installed
Chromium executable if it is elsewhere. They start and stop a temporary local
backend and cover multi-witness saving/reopening, unchanged JSON/TEI exports,
image reconnection, invalid project rejection, the TEI dialog, mixed structures,
and ALTO verse boundaries after manual regrouping.

## Code map

| File | Role |
|---|---|
| `backend/app.py` | Local HTTP server, ALTO parsing and alignment |
| `backend/automatic_semantic.py` | Automatic uncertainty detection, recovery quality gates and diagnostics |
| `backend/semantic_alignment.py` | Optional Bertalign runtime and validated passage proposals |
| `backend/alto_support.py` | ALTO tag and XML helpers |
| `backend/relocations.py` | Displaced-passage suggestions |
| `frontend.js` | Witness loading, review state, project sessions and export dialog |
| `export-support.js` | Witness IDs, TEI structures, ALTO line reconstruction and apparatus rendering |
| `index.html` | Application interface and styles |
| `LANCER_LINUX.sh`, `start.sh` | Linux launcher and dependency setup |
| `requirements.txt` | Optional Bertalign dependency |
| `tests/test_alignment_features.py` | Backend regression tests |
| `tests/test_automatic_semantic.py` | Automatic recovery policy and integration unit tests |
| `tests/test_semantic_alignment.py` | Semantic proposal control-flow and source-mapping unit tests |
| `tests/test_export_support.cjs` | Export unit tests |
| `tests/test_project_sessions.cjs` | Browser regression tests |

## Citation

If you use this version of the software in research, please cite:

> Roulet, Theo, and Serena Crespi. *PRIMA Textual Collation*. Version 0.1, 2026.

Machine-readable citation metadata are provided in [`CITATION.cff`](CITATION.cff).

This version develops and implements the earlier collation application created at Université Grenoble Alpes, UMR Litt&Arts: [Collation CreNum](https://gricad-gitlab.univ-grenoble-alpes.fr/elan/collation/Collation_CreNum).

## License

Released under the MIT License. See [`LICENSE`](LICENSE).

## Acknowledgements

This software is developed within the **PRIMA project**, funded by the **European Research Council (ERC)**.
