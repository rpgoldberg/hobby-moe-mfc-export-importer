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
5. Run:

```js
MFC_IMPORT.run({ start: 0 })                       // whole list; a stopped run resumes from where it was
MFC_IMPORT.run({ start: 0, statuses: ['Owned'] })  // one MFC status only
MFC_IMPORT.stop()
copy(MFC_IMPORT.csv())                             // result table: mfc id, title, jan, outcome
```

Start with a short slice (`run({ start: 0 })` then `stop()` after a few) before letting it run through.

## What it does per item

Opens the Add Items dialog, types the barcode into the search box, reads the site's own search response, clicks Add on the row whose barcode matches exactly, then clicks Add 1 Item. When nothing was selected it clicks Cancel.

Outcomes in the result table:

| outcome | meaning |
|---|---|
| `add` | selected and committed |
| `already-in-collection?` | the search found the barcode but the site showed no row (it hides items already in the collection) |
| `not-found` | no search hit |
| `no-exact-barcode` | hits, but none with that exact barcode |
| `ambiguous: …` | more than one item on the site shares the barcode; names listed, add by hand |
| `no-barcode` | the MFC row has no barcode; search by title by hand |

## Knobs

`run({ batch: 1, delayMs: 250, timeoutMs: 8000, statuses: null, start: null })`

- `batch` commits after this many selections. Raise it if selections survive across searches in the dialog.
- `delayMs` pause between items. Keep it polite.
- Progress lives in `localStorage` under `mfc_import_progress`; `MFC_IMPORT.reset()` clears it.

## Status

Iteration 1. Selectors are by role and visible text, not CSS classes, but the site can still change under it.
