# Family Tree

A phone-friendly family tree that runs as a **static site on GitHub Pages**. The whole family
lives in one spreadsheet — [`data/family_template.csv`](data/family_template.csv) — and the app
renders the tree **straight from that CSV**, live. Edit the CSV, and the tree updates within a
second or two. It's **view-only** in the browser (no in-app editing); the CSV is the source of
truth.

## Features
- Collapsible, pan/zoom tree (D3) built for large families — distant branches start collapsed.
- Renders **live from the CSV**: the page re-reads the file every couple of seconds, so saving
  the CSV updates the tree automatically (toggle **Live** off to stop polling, or hit **Reload**).
- **Edit CSV** button to paste or upload a CSV and preview it as you type — nothing is written to
  disk.
- Shows: name (first/last), gender, **living/deceased** & **married** status, spouse(s),
  **multiple fathers/mothers**, sons/daughters (derived), date of birth/death, photo, and four
  locations — native place, **current**, **maher** (parental home) & **sasar** (in-laws' home) —
  each village/taluka/district/pincode, plus phone.
- Spouses render as **companions** beside their partner with a marriage line; a spouse shows a
  **+** to jump to their own parental family when that family is linked in the data.
- **Analytics bar**: total people and the number of distinct maher + sasar villages.
- **People table** (📋) — a sortable, filterable list of everyone; click a row to jump to them.
- Search with live suggestions ("firstname fathername lastname (village)") to jump to a person.
- A default **Ancestors** couple is seeded automatically; top-level people descend from them.

## Run locally
No build step and no Node needed. From this folder:

```bash
python -m http.server 8000
```

Open <http://localhost:8000>. To try it from your phone on the same Wi‑Fi, use your PC's LAN IP
(e.g. `http://192.168.1.50:8000`). It **must** be served over http — opening `index.html`
directly as a file won't let the browser read the CSV. Point the app at a different CSV with
`?csv=path/to/file.csv`.

## Deploy to GitHub Pages
1. Create a GitHub repo (e.g. `family-tree`) and push these files to the `main` branch.
2. Repo **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*,
   Branch = `main` / root. Your site appears at `https://<username>.github.io/family-tree/`.
3. To update the tree, edit [`data/family_template.csv`](data/family_template.csv) and commit it;
   Pages redeploys within a minute or two.

## The CSV
Open [`data/family_template.csv`](data/family_template.csv) in Excel / Google Sheets. Give each
person a unique **member_id** number (1, 2, 3, …); link relationships by putting those numbers in
**father_id / mother_id / spouse_id** (separate multiple ids with `;`). Leave father_id /
mother_id **blank** for a top-level person — they are attached to the default ancestors
automatically. Required columns: firstName, lastName, village, taluka, district. `gender` accepts
`male`/`female`/`other` or short `M`/`F`/`O` (blank ⇒ other). Optional extras: `alive` (yes/no —
defaults to yes unless `dod` is set), `married` (yes/no — defaults to "has a spouse"), and the
current/maher/sasar locations via `current_village|taluka|district|pincode` and the matching
`maher_*` and `sasar_*` columns.

The browser parses the CSV directly (see [`js/csv-import.js`](js/csv-import.js)), so no build
step is needed to view changes.

### Optional: generate `data/family.json`
A Python converter is included if you want a JSON snapshot of the data (same parsing rules as the
browser):

```bash
python tools/csv_to_json.py                 # data/family_template.csv -> data/family.json
# or: python tools/csv_to_json.py my.csv     # use your own CSV file
```

It seeds the default ancestors, makes spouse links mutual, and prints warnings for any missing
required fields or unknown id references. The app does not need this file to run.

## Project layout
```
index.html         App shell + the view-only CSV-driven bootstrap
css/styles.css     Responsive styling (light/dark)
js/config.js       Data path + collapse depth
js/data.js         In-memory store, derived children, normalization
js/csv-import.js   Browser CSV -> people (mirrors tools/csv_to_json.py)
js/tree.js         D3 collapsible tree (pan/zoom, search focus, spouse companions)
js/person.js       Detail panel
js/analytics.js    Top-of-page stats (people, maher+sasar villages)
js/table.js        Filterable/sortable people table
js/vendor/d3.min.js  D3 v7 (vendored locally — no CDN, works offline)
data/family_template.csv  The family data (source of truth)
tools/csv_to_json.py      Optional: converts the CSV into data/family.json
photos/                   Photo files referenced by the `photo` column
```
