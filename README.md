# Family Tree

A phone-friendly family tree that runs as a **static site on GitHub Pages**. Data lives in a
JSON file in the repo (`data/family.json`); edits made in the browser are committed straight
back to the repo via the GitHub API, so changes republish automatically and show up on every
device.

## Features
- Collapsible, pan/zoom tree (D3) built for large families — distant branches start collapsed.
- Stores: name (first/last), gender, **living/deceased** status, spouse(s), **multiple
  fathers/mothers**, sons/daughters (derived), date of birth, date of death, photo, and four
  locations — native place, **current** location, **maher** (parental home) & **sasar**
  (in-laws' home) — each village/taluka/district/pincode, plus phone.
- Search with live suggestions ("firstname fathername lastname (village)") to jump to a person.
- Add / edit / delete people behind a simple edit password. The add/edit form shows the required
  fields first, with everything optional tucked under a **More details** toggle.
- Indian pincode lookup auto-fills the first village/taluka/district; pick another village to keep
  its taluka & district in sync, or choose **Other** to type manually.
- Photo upload (committed to `photos/`) or paste an image URL; placeholder avatars otherwise.
- A default **Ancestors** couple is seeded and cannot be edited or deleted — new top-level
  people descend from them.

## Run locally
No build step and no Node needed. From this folder:

```bash
python -m http.server 8000
```

Open <http://localhost:8000>. To try it from your phone on the same Wi‑Fi, use your PC's LAN IP
(e.g. `http://192.168.1.50:8000`). Saving to GitHub works from `localhost` too.

## Deploy to GitHub Pages
1. Create a GitHub repo (e.g. `family-tree`) and push these files to the `main` branch.
2. Repo **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*,
   Branch = `main` / root. Your site appears at `https://<username>.github.io/family-tree/`.
3. Edit [`js/config.js`](js/config.js) and set `github.owner` and `github.repo` to match.

## Set the edit password
- The first time you click **Edit** with no password configured, you'll be asked to create one.
  It's stored on that device, and a **Copy hash** button gives you a SHA‑256 hash.
- Paste that hash into `passwordHash` in [`js/config.js`](js/config.js) and commit it, so the
  same password unlocks editing on every device.

> Note: the password only hides the edit UI (its hash is in the source) — it is **not** real
> security. The GitHub token below is what actually authorizes writes.

## Create a GitHub token (for saving)
Editing needs a token so the browser can commit changes:
1. GitHub → **Settings → Developer settings → Fine-grained tokens → Generate new token**.
2. **Repository access**: only your `family-tree` repo.
3. **Permissions → Repository → Contents: Read and write**.
4. Generate, copy the token, then in the app: **Edit → 🔑** and paste it. It's stored only in
   your browser (`localStorage`); use **Forget token** to remove it. Keep it private — anyone
   with it can write to this repo.

## How saving works
When you **Save to GitHub**: staged photos are uploaded to `photos/`, then `data/family.json`
is committed with your changes. GitHub Pages redeploys within a minute or two.

## Bulk import from a CSV (one-time data entry)
Rather than adding everyone through the UI, you can fill in a spreadsheet once and convert it.

1. Open [`data/family_template.csv`](data/family_template.csv) in Excel / Google Sheets. Replace
   the sample rows with your family. Give each person a unique **member_id** number (1, 2, 3, …);
   link relationships by putting those numbers in **father_id / mother_id / spouse_id** (separate
   multiple ids with `;`). Leave father_id / mother_id **blank** for a top-level person — they
   are attached to the default ancestors automatically. Required columns: firstName, lastName,
   village, taluka, district. `gender` accepts `male`/`female`/`other` or short `M`/`F`/`O`
   (blank ⇒ other). Optional extras: `alive` (yes/no — defaults to yes unless `dod` is set),
   and the current/maher/sasar locations via `current_village|taluka|district|pincode` and the
   matching `maher_*` and `sasar_*` columns.
2. Run the converter (Python 3, no extra packages):
   ```bash
   python tools/csv_to_json.py                 # data/family_template.csv -> data/family.json
   # or: python tools/csv_to_json.py my.csv     # use your own CSV file
   ```
   It seeds the default ancestors, makes spouse links mutual, and prints warnings for any
   missing required fields or unknown id references. **It overwrites `data/family.json`.**
3. Commit the regenerated `data/family.json` (and push, so Pages redeploys).

## Project layout
```
index.html         App shell + script includes
css/styles.css     Responsive styling (light/dark)
js/config.js       Repo settings, data path, password hash, collapse depth
js/data.js         In-memory store, validation, derived children, serialization
js/github.js       GitHub Contents API (read sha, commit file, upload photo)
js/auth.js         Password gate + token storage
js/tree.js         D3 collapsible tree (pan/zoom, search focus)
js/person.js       Detail panel + add/edit/delete form
js/location.js     Indian pincode lookup (India Post API) for village/taluka/district
js/app.js          Bootstrap, toolbar wiring, edit mode, commit flow
js/vendor/d3.min.js  D3 v7 (vendored locally — no CDN, works offline)
data/family.json          The family data (seeded with the default ancestors)
data/family_template.csv  Fill-in-once CSV for bulk data entry
tools/csv_to_json.py      Converts the CSV into data/family.json
photos/                   Uploaded photos land here
```
