#!/usr/bin/env python3
"""Run the real automatic pipeline and produce a local, visible before/after report.

No mocked encoder or simulated proposal is used by this script.
Run with the Python environment containing Bertalign, e.g. .venv/bin/python.
"""
import argparse
import html
import json
from pathlib import Path
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from app import align_alto_words, align_witness_inputs, parse_alto_bundle


def table(rows):
    def text(row, side):
        return html.escape(' '.join(item['text'] for item in row[side]) or '—')
    return '<table><tr><th>Unità</th><th>A</th><th>B</th></tr>' + ''.join(
        f'<tr><td>{i+1}</td><td>{text(row, "aItems")}</td><td>{text(row, "bItems")}</td></tr>'
        for i, row in enumerate(rows)) + '</table>'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--a', default='samples/Malmantile_II.IV.232/IMG_20250905_143230.xml')
    parser.add_argument('--b', default='samples/Malmantile_Tordi.435/IMG_20250905_153318.xml')
    parser.add_argument('--out', type=Path, help='Output directory; defaults to a new temporary directory.')
    args = parser.parse_args()
    paths = [(ROOT / Path(name)).resolve() for name in (args.a, args.b)]
    a, b = [parse_alto_bundle([{'name': path.name, 'text': path.read_text(encoding='utf-8')}]) for path in paths]
    start = time.perf_counter()
    before = align_alto_words(a, b)
    after, method, _, diagnostic = align_witness_inputs(a, b, include_diagnostics=True)
    elapsed = round(time.perf_counter() - start, 3)
    directory = args.out or Path(tempfile.mkdtemp(prefix='htrvarians-bertalign-'))
    directory.mkdir(parents=True, exist_ok=True)
    result = {'sources': [str(p) for p in paths], 'source_lines': [len(a), len(b)],
              'elapsed_seconds': elapsed, 'method': method, 'semanticFallback': diagnostic,
              'baseline': before, 'result': after, 'simulation': False}
    (directory / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    status = html.escape(diagnostic['status'])
    page = f'''<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test reale Bertalign</title><style>body{{font:15px/1.5 system-ui;margin:30px;color:#25252a}}table{{width:100%;border-collapse:collapse;font-size:13px}}td,th{{padding:8px;border:1px solid #ddd;text-align:left;vertical-align:top}}pre{{white-space:pre-wrap;background:#f3f3f3;padding:15px}}</style><h1>HTRVariansTool · Test reale</h1><p>Esito del fallback: <strong>{status}</strong>. Finestre tentate: {diagnostic['attempted']}; accettate: {diagnostic['accepted']}.</p><p>Tempo totale: {elapsed} s, incluso confronto lessicale e suggerimenti di spostamento.</p><p>Se lo stato indica modello assente/non disponibile, o nessun tentativo, questo report non dimostra un’esecuzione riuscita di LaBSE. Nessun modello è simulato dallo script.</p><details><summary>Diagnostica completa</summary><pre>{html.escape(json.dumps(diagnostic,ensure_ascii=False,indent=2))}</pre></details><h2>Prima: allineamento lessicale</h2>{table(before)}<h2>Dopo: risultato del percorso automatico</h2>{table(after)}</html>'''
    (directory / 'report.html').write_text(page, encoding='utf-8')
    print(json.dumps(diagnostic, ensure_ascii=False, indent=2))
    print(f'\nReport visibile: {directory / "report.html"}\nDati: {directory / "result.json"}')


if __name__ == '__main__':
    main()
