# PRIMA Textual Collation

Local application for comparing manuscript witnesses transcribed in ALTO XML. It aligns words against a reference witness, supports scholarly review, and exports collation data as JSON or a TEI fragment.

## Quick start

### Linux (Ubuntu)

```bash
sudo apt install python3.12 python3.12-venv
sh LANCER_LINUX.sh
```

The first launch creates `.venv/` and installs dependencies. Keep the terminal open while using the app; stop it with `Ctrl+C`.

### macOS

```bash
sh LANCER_MAC.command
```

Python 3 must be installed. Some optional Bertalign features require the dependencies in `requirements.txt`.

## Workflow

1. Load ALTO files for the reference witness and add up to nine other witnesses.
2. Optionally load page images to inspect source lines and context.
3. Review proposed variants and adjust uncertain alignments.
4. Export the review as JSON or a TEI fragment.

## Save and resume a project

Use **Save project** to download `varians-project.json`. It includes the original
ALTO XML, all witness comparisons, saved text and alignment corrections, variant
and displaced-passage decisions, witness names, IIIF URLs, and view settings.
Finish or cancel any open edit before saving. Projects can also be saved before
alignment. This is an explicit save; there is no automatic recovery yet.

Use **Open project** to resume without recalculating the alignment. Opening a
project asks before replacing an existing session. Invalid files and unsupported
format versions are rejected without replacing the current session; the maximum
project file size is 100 MB. The existing **Export decisions JSON** is a results
export, not a resumable project file.

Local images are not embedded. Reselect them using each witness's image selector;
saved manual associations reconnect by filename. Keep image filenames unique
within a witness. IIIF URLs are retained. The project contains manuscript text
and should be shared accordingly.

### Project session tests

Run `python3 -B -m unittest discover -s tests -v` for backend tests.
The browser regression tests require Node.js, Playwright (`npm install --prefix
/tmp/varians-browser-tests playwright`), and Chromium. With Playwright already
available, run:

```bash
node --test tests/test_project_sessions.cjs
```

Otherwise set `NODE_PATH=/tmp/varians-browser-tests/node_modules` for that command.
The tests use `/usr/bin/chromium` by default; set `CHROMIUM_PATH` to use a different
Chromium executable. They start and stop a temporary local backend and check
multi-witness restoration, unchanged JSON/TEI exports, image reconnection,
invalid-file rejection, cancellation, and resuming before alignment.

## Mixed prose/poetry and witness identifiers

Click **Export full TEI text** to open the export dialog. Choose **One genre for
the whole text** (prose, poetry or drama) or **Different genres by interval**.
For mixed text, use **From unit**, **To unit**, and the genre selector for each
interval. For example, units 1–12 can be prose, 13–28 poetry, and 29–45 prose.
Edit the first interval's end before adding the next one. Intervals must cover
every unit once, in order, with no gaps or overlaps. Invalid intervals keep the
dialog open and show an explanation.

Click **Download TEI** to export and retain these settings for future exports and
project saves. **Cancel** or Escape discards changes made in the dialog. Opening
the dialog alone does not download a file or change the saved structure.

Numbering follows the reference units in the **first witness comparison**, named
in the dialog. Expand **Reference unit numbering and source lines** to see the
numbered readings and their ALTO references, especially when viewing a different
comparison. A unit is a review row, which may contain multiple physical lines.
Each poetry unit exports as one `<l>` inside `<lg>`; check and adjust grouping to
match verse boundaries. Each prose interval exports as one `<p>`. This does not
automatically infer paragraphs, verse boundaries or stanzas. A retained variant
that crosses a verse/structure boundary is reported rather than silently omitted;
adjust the alignment or interval boundaries before exporting.

Intervals are included in saved projects and decisions JSON. Older projects
without intervals still open using their saved uniform structure.

JSON results and TEI witness identifiers now derive from assigned witness names,
using the **same identifiers in both formats and in every TEI `wit` reference**.
Valid names such as `Tordi.435` are preserved; `BNCF II.IV.232` becomes
`BNCF_II.IV.232`. XML-incompatible characters become underscores, names beginning
with a number receive `witness_`, and collisions receive `_2`, `_3`, etc.
The original display names are retained. The dialog previews the exported IDs.
Projects retain internal comparison keys for reopening; those keys are distinct
from the public identifiers in results exports.

Run the export unit tests without browser dependencies:

```bash
node --test tests/test_export_support.cjs
```

## Alignment

- ALTO lines are flattened into each witness’s ordered word stream.
- Shared word sequences anchor the comparison; weighted word-level Levenshtein aligns intervening spans.
- Results are mapped back to ALTO lines. Unmatched text keeps its source-line boundaries and references.
- Bertalign is not used for the main word alignment; it may be used by legacy displaced-passage suggestions.

All alignments are proposals for scholarly review.

## Code map

| File | Role |
|---|---|
| `backend/app.py` | HTTP server, ALTO parsing, alignment, exports |
| `backend/alto_support.py` | ALTO and XML helpers |
| `backend/relocations.py` | Displaced-passage suggestions |
| `frontend.js` | Witness loading, review interface, exports |
| `export-support.js` | Shared witness identifier and mixed-structure export rules |
| `index.html` | Application interface and styles |
| `LANCER_LINUX.sh`, `LANCER_MAC.command` | Platform launchers |
| `start.sh` | Environment setup and server startup |
| `requirements.txt` | Optional Bertalign runtime dependencies |

## Citation

If you use this version of the software in research, please cite:

> Roulet, Theo, and Serena Crespi. *PRIMA Textual Collation*. Version 0.1, 2026.

Machine-readable citation metadata are provided in [`CITATION.cff`](CITATION.cff).

This version develops and implements the earlier collation application created at Université Grenoble Alpes, UMR Litt&Arts: [Collation CreNum](https://gricad-gitlab.univ-grenoble-alpes.fr/elan/collation/Collation_CreNum).

## License

Released under the MIT License. See [`LICENSE`](LICENSE).

## Acknowledgements

This software is developed within the **PRIMA project**, funded by the **European Research Council (ERC)**.
