# hobby-moe-mfc-export-importer

Adds the items from a MyFigureCollection CSV export to a hobby.moe collection, from your own browser session. Nothing is stored or sent anywhere else; the script drives the site's Add Items dialog the way you would by hand.

## Use

1. Export your MFC collection as CSV with all fields (comma delimiter).
2. Turn it into a paste-able list. Either:
   - PowerShell: `.\prep.ps1` (or `.\prep.ps1 path\to\export.csv`)
   - cmd: `powershell -NoProfile -ExecutionPolicy Bypass -File prep.ps1`
   - WSL, git bash, macOS, Linux: `python3 prep.py`

   This writes `mfc-items.js` next to the CSV and copies it to the clipboard.
3. On hobby.moe, logged in, open the collection you want to fill and open the browser console.
4. Paste `mfc-items.js`, then paste `hobbymoe-import.js`.
5. Run one command at a time (pasting several lines at once runs them all, including `stop()`):

```js
MFC_IMPORT.run()                      // Owned items; a stopped run resumes where it was
MFC_IMPORT.run({ status: 'Wished' })  // or 'Ordered'; run({ statuses: 'all' }) for everything
MFC_IMPORT.stop()
copy(MFC_IMPORT.csv())                // result table: mfc id, title, jan, outcome
MFC_IMPORT.last                       // the last item's search hits and visible rows, for debugging
MFC_IMPORT.clear({ confirm: true })   // remove every item shown on this collection page
```

Start with a few items, then `stop()`, before letting it run through.

## What it does per item

Looks the barcode up on the site's own search endpoint (the one the dialog uses), from inside the page. If exactly that barcode exists, is not flagged adult and is of the type the dialog lists, it opens the Add Items dialog, types the barcode, clicks Add on the row carrying the hit's name, then clicks Add 1 Item. When nothing was selected it clicks Cancel. Items that cannot be added are skipped without touching the dialog.

Outcomes in the result table:

| outcome | meaning |
|---|---|
| `add` | selected and committed |
| `not-found` | no item on the site with that barcode |
| `adult-hidden?` | the item is flagged adult and the dialog showed no row for it; the dialog hides adult items until the account has an age set (`run({ skipAdult: true })` skips them up front) |
| `other-type` | the item exists under a type the dialog does not list |
| `already-in-collection?` | the item exists but the dialog showed no row for it (it hides items already in the collection) |
| `no-rows-shown` | the item exists but the dialog showed nothing within the wait |
| `no-barcode` | the MFC row has no barcode; search by title by hand |

## Knobs

`run({ batch: 1, delayMs: 150, searchMs: 500, timeoutMs: 4000, statuses: ['Owned'], start: null, verbose: true })`

- `batch` commits after this many selections. Raise it if selections survive across searches in the dialog.
- `delayMs` pause between items. `searchMs` is the most it waits for search results.
- `verbose` prints the search hits and visible rows for every item that was not added.
- Progress lives in `localStorage` under `mfc_import_progress`; `MFC_IMPORT.reset()` clears it.

## Status

Iteration 1. Selectors are by role and visible text, not CSS classes, but the site can still change under it.
