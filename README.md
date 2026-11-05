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
