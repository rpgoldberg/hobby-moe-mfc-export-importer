#!/usr/bin/env python3
# MFC export -> mfc-items.js  (WSL / git bash / anywhere with python3). Same output as prep.ps1.
# Usage: python3 prep.py [path/to/export.csv]   (default: newest *@MFC*.csv in the Windows or home Downloads folder)
import csv, glob, json, os, re, shutil, subprocess, sys
def newest():
    pats = glob.glob("/mnt/c/Users/*/Downloads/*@MFC*.csv") + glob.glob(os.path.expanduser("~/Downloads/*@MFC*.csv"))
    return max(pats, key=os.path.getmtime) if pats else None
src = sys.argv[1] if len(sys.argv) > 1 else newest()
if not src: sys.exit("no MFC export found; pass the CSV path")
with open(src, newline="", encoding="utf-8-sig") as f:
    rows = list(csv.DictReader(f))
items = [{"id": r["ID"], "title": r["Title"], "jan": re.sub(r"[^0-9]", "", r.get("Barcode") or ""), "status": r["Status"]} for r in rows]
js = "window.MFC_ITEMS = " + json.dumps(items, ensure_ascii=False, separators=(",", ":")) + ";"
out = os.path.join(os.path.dirname(src), "mfc-items.js")
with open(out, "w", encoding="utf-8") as f:
    f.write(js)
clip = shutil.which("clip.exe") or shutil.which("pbcopy") or shutil.which("xclip")
if clip:
    subprocess.run([clip] + (["-selection", "clipboard"] if clip.endswith("xclip") else []), input=js.encode("utf-8"))
print(f"rows={len(items)} noBarcode={sum(1 for i in items if not i['jan'])} -> {out}" + (" (also on the clipboard)" if clip else ""))
