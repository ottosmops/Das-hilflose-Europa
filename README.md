# Robert Musil, *Das hilflose Europa oder Reise vom Hundertsten ins Tausendste*

TEI edition of Robert Musil's essay (first published 1922 in *Ganymed. Ein Jahrbuch für die Kunst*, vol. 4, pp. 217–239).

Source: <https://doi.org/10.11588/diglit.45237.18>

## What's in this repository

```
.
├── das_hilflose_europa.xml    # TEI P5 source (validates against tei_all)
├── viewer/                    # Static HTML/JS reading interface
│   ├── index.html
│   ├── viewer.css
│   └── viewer.js
├── assets/                    # Musil portrait + Open Graph banner
├── favicon.svg                # M monogram favicon
├── index.html                 # Root redirect → viewer/ (for GitHub Pages)
├── .nojekyll                  # Disables Jekyll on GitHub Pages
└── README.md
```

Photo of Musil: Wikimedia Commons, [File:Musil.jpg](https://commons.wikimedia.org/wiki/File:Musil.jpg), 1930, public domain.

## TEI markup

The essay body retains Musil's original wording verbatim. All editorial work is layered on top:

- **`<standOff>`** holds three registers (`listPerson`, `listPlace`, `listBibl`) with `xml:id`s, biographical data, short factual notes, and external authority links (GND, Wikidata, GeoNames, VIAF).
- **Inline entity tags** (`<persName ref="#…">`, `<placeName ref="#…">`, `<bibl ref="#…">`) link mentions in the body to those register entries.
- **Inline `<note resp="#claude">`** elements add brief explanations (≈ 2–3 sentences) of difficult passages, allusions, and historical context. Target audience: upper-secondary / *Abitur* level.
- One person (`pers_strich`, Walter Strich) is marked `cert="medium"` — identification not fully secured.

### Numbers at a glance

| | count |
|---|---|
| Persons in register | 34 |
| Places in register | 10 |
| Works in register | 8 |
| Inline `persName` references | 41 |
| Inline `placeName` references | 10 |
| Inline `bibl` references | 8 |
| Editorial notes in body | 21 |

Validation: `xmllint --relaxng tei_all.rng das_hilflose_europa.xml` → *validates*.

## Viewer

Single-page reading interface that loads the TEI client-side (no build step, no dependencies).

- Three-column layout: entity index · reading text · detail panel
- Colour-coded entity highlighting (persons blue, places green, works orange)
- Hover tooltips, click-to-open detail panel with all external authority links
- Full-text search (auto-expands notes containing matches)
- Filters per entity type and per note author
- Page-break buttons link to the Heidelberg facsimile

### Online (GitHub Pages)

Once Pages is enabled for this repository, the viewer is served at:
<https://ottosmops.github.io/Das-hilflose-Europa/>

To enable: *Settings → Pages → Build and deployment → Deploy from a branch → `main`, folder `/ (root)`*. The root `index.html` redirects to `viewer/`; `.nojekyll` disables Jekyll processing.

### Local

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

(The viewer uses `fetch` to load the XML, which is blocked under `file://` for cross-origin reasons — a local server is required.)

## Contributing

To add commentary, edit the TEI directly. New notes should use `<note resp="github-username">` or any other unique `@resp` value so authorship stays traceable. Pull requests welcome.

## Editorial history

- **Original markup**: bibliographic notes by `resp="ak"`, a handful of `<persName>` tags without identifiers.
- **2026-05-12**: full register build-out (GND/Wikidata/VIAF/GeoNames), inline tagging of all persons/places/works, note layer expanded and rewritten for *Abitur* readership. All notes are now attributed `resp="#claude"`; the editorial decisions are documented in the `<encodingDesc>` of the TEI file.

## License

The essay text is in the public domain. The editorial annotations and viewer code are released under CC0 unless otherwise noted.
