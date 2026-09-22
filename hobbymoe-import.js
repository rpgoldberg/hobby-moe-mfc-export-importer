// hobby.moe collection import from an MFC export.
// 1. Paste mfc-items.js first (defines window.MFC_ITEMS).
// 2. Be on the collection's page, logged in. 3. Paste this file. 4. MFC_IMPORT.run()  (Owned by default; run({ status: 'Wished' }) for another list)
// Stop any time with MFC_IMPORT.stop(). Progress is in localStorage under 'mfc_import_progress'; run() resumes from it.
(() => {
  const cfg = {
    batch: 1, delayMs: 150, searchMs: 500, timeoutMs: 4000, statuses: ['Owned'], start: null, verbose: true,
    searchUrl: 'https://search.hobby.moe/indexes/items/search',
    typeId: 'rh77ksk7spb166dtj2s5qnjbkn801k5s', // the item type the Add Items dialog searches (from its own request)
    skipAdult: false, // true = do not try adult-flagged items (the dialog hides them until the account has an age set)
  };
  const log = [];
  const last = { jan: '', hits: [], rows: [] };
  let stopFlag = false, running = false, barcodeFilterable = null;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const txt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  // --- the site's own search endpoint, called the way the dialog calls it (no auth header; the page origin is what gets it through)
  const post = async (body) => {
    const res = await fetch(cfg.searchUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(j.hits)) throw new Error('search ' + res.status + ' ' + (j.message || ''));
    return j.hits;
  };
  const lookup = async (jan) => {
    if (barcodeFilterable !== false) {
      try { const hits = await post({ q: '', filter: `barcode = "${jan}"`, limit: 10 }); barcodeFilterable = true; return hits; }
      catch (e) { if (barcodeFilterable === true) throw e; barcodeFilterable = false; }
    }
    return (await post({ q: jan, matchingStrategy: 'all', limit: 50 })).filter((h) => h.barcode === jan);
  };

  // --- DOM helpers (matched by role and text, never by class)
  const openDialog = () => document.querySelector('[role="dialog"][data-state="open"]');
  const buttonsIn = (root, re) => [...root.querySelectorAll('button')].filter((b) => re.test(txt(b)));
  const pageAddItemsButton = () => buttonsIn(document, /^Add Items$/).find((b) => !b.closest('[role="dialog"]'));
  const searchInput = (d) => d.querySelector('input[placeholder^="Search"]');
  const footer = (d) => {
    const commit = buttonsIn(d, /^Add( \d+)? Items?$/).find((b) => b.closest('[role="dialog"]') === d);
    const m = commit ? txt(commit).match(/\d+/) : null;
    return { cancel: buttonsIn(d, /^Cancel$/)[0], commit, selected: m ? Number(m[0]) : (commit && !commit.disabled ? 1 : 0) };
  };
  const rowButtons = (d) => buttonsIn(d, /^(Add|Remove)$/);
  const rowsOf = (d) => {
    const all = rowButtons(d);
    return all.map((b) => {
      let el = b; // the row = the largest ancestor that holds only this one Add/Remove button
      while (el.parentElement && el.parentElement !== d && all.filter((x) => el.parentElement.contains(x)).length === 1) el = el.parentElement;
      return { button: b, row: el, text: txt(el), state: txt(b) };
    });
  };
  const waitFor = async (fn, ms = cfg.timeoutMs) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(100); } };
  const setInput = (input, value) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const ensureDialog = async () => {
    let d = openDialog();
    if (d && searchInput(d)) return d;
    const b = pageAddItemsButton(); if (!b) throw new Error('page "Add Items" button not found');
    b.click();
    d = await waitFor(() => { const x = openDialog(); return x && searchInput(x) ? x : null; });
    if (!d) throw new Error('dialog did not open');
    return d;
  };
  const typeAndWait = async (d, jan) => {
    const before = rowsOf(d).map((r) => r.text).join('|');
    setInput(searchInput(d), jan);
    await waitFor(() => { const now = rowsOf(d).map((r) => r.text).join('|'); return now && now !== before; }, cfg.searchMs);
    await sleep(150);
    return rowsOf(d);
  };
  // the row whose text carries the hit's name (rows read "<name><maker>Add"); falls back to the MFC title's character segment
  const rowFor = (rows, hit, title) => {
    const byName = rows.filter((r) => norm(r.text).includes(norm(hit.name)));
    if (byName.length === 1) return byName[0];
    const segs = String(title).replace(/^\[[^\]]*\]\s*-\s*/, '').replace(/\s*\([^)]*\)\s*$/, '').split(/\s+-\s+/).map(norm).filter((x) => x.length > 1);
    const ch = segs.length > 1 ? segs[1] : segs[0];
    const scored = rows.map((r) => { const n = norm(r.text); return { r, n: segs.filter((g) => n.includes(g)).length, ch: n.includes(ch) }; }).filter((x) => x.ch && x.n > 0);
    const best = Math.max(0, ...scored.map((x) => x.n)); const top = scored.filter((x) => x.n === best);
    return top.length === 1 ? top[0].r : null;
  };

  const one = async (item) => {
    const hits = await lookup(item.jan);
    Object.assign(last, { jan: item.jan, hits, rows: [] });
    const out = (outcome, hit) => ({ id: item.id, title: item.title, jan: item.jan, status: item.status, outcome, hobbymoe: hit ? hit.name : '' });
    if (!hits.length) return out('not-found');
    const usable = hits.filter((h) => (!cfg.skipAdult || !h.adultItem) && (!cfg.typeId || h.typeId === cfg.typeId));
    if (!usable.length) return out(hits.some((h) => h.adultItem) ? 'adult-hidden' : 'other-type', hits[0]);
    const d = await ensureDialog();
    const rows = await typeAndWait(d, item.jan);
    last.rows = rows.map((r) => r.text);
    let pick = null;
    for (const h of usable) { pick = rowFor(rows, h, item.title); if (pick) { var hit = h; break; } }
    if (!pick) {
      if (cfg.verbose) console.log(`   hits=${JSON.stringify(usable.map((h) => h.name))} rows=${JSON.stringify(rows.map((r) => r.text.slice(0, 90)))}`);
      return out(usable[0].adultItem ? 'adult-hidden?' : rows.length ? 'already-in-collection?' : 'no-rows-shown', usable[0]);
    }
    if (pick.state === 'Remove') return out('already-selected', hit);
    pick.button.click();
    await waitFor(() => footer(d).selected > 0, 1500);
    return out('add', hit);
  };

  const commit = async () => {
    const d = openDialog(); if (!d) return;
    const f = footer(d);
    if (f.selected > 0 && f.commit && !f.commit.disabled) {
      f.commit.click();
      const closed = await waitFor(() => !openDialog() || footer(openDialog()).selected === 0 ? true : null, 3000);
      if (!closed) { const g = footer(openDialog()); if (g.commit && !g.commit.disabled) { g.commit.click(); await waitFor(() => !openDialog(), 3000); } }
    } else if (f.cancel) { f.cancel.click(); await waitFor(() => !openDialog(), 3000); }
    await sleep(cfg.delayMs);
  };

  const run = async (opts = {}) => {
    if (running) throw new Error('a run is already in progress; MFC_IMPORT.stop() first');
    if (typeof opts.status === 'string') opts.statuses = [opts.status];
    if (opts.statuses === 'all') opts.statuses = null;
    Object.assign(cfg, opts);
    const items = (window.MFC_ITEMS || []).filter((i) => !cfg.statuses || cfg.statuses.includes(i.status));
    if (!items.length) throw new Error('window.MFC_ITEMS is empty: paste mfc-items.js first');
    console.log(`importing ${items.length} items (${cfg.statuses ? cfg.statuses.join('/') : 'all statuses'})`);
    running = true; stopFlag = false;
    let i = cfg.start ?? Number(localStorage.getItem('mfc_import_progress') || 0), pending = 0;
    try {
      for (; i < items.length && !stopFlag; i++) {
        const it = items[i];
        if (!it.jan) { log.push({ ...it, outcome: 'no-barcode' }); continue; }
        let r;
        try { r = await one(it); } catch (e) { r = { ...it, outcome: 'error: ' + e.message }; }
        log.push(r); console.log(`${i + 1}/${items.length} ${r.outcome} | mfc ${it.id} | ${it.title}`);
        if (r.outcome === 'add') pending++;
        if (pending >= cfg.batch || (pending === 0 && openDialog())) { await commit(); pending = 0; }
        localStorage.setItem('mfc_import_progress', String(i + 1));
        await sleep(cfg.delayMs);
      }
      if (pending) await commit();
    } finally { running = false; }
    const added = log.filter((r) => r.outcome === 'add'), failed = log.filter((r) => r.outcome !== 'add');
    console.log(`done: ${added.length} added, ${failed.length} not added${stopFlag ? ' (stopped)' : ''}`);
    console.table(failed.map((r) => ({ mfc: r.id, title: r.title, jan: r.jan, outcome: r.outcome })));
    return log;
  };

  // Remove every item from the collection on this page: first item's delete trigger, then "Remove Item" in the confirmation, repeat.
  const clear = async ({ confirm = false, max = Infinity } = {}) => {
    if (!confirm) throw new Error('this removes every item on this page: MFC_IMPORT.clear({ confirm: true })');
    if (running) throw new Error('a run is already in progress; MFC_IMPORT.stop() first');
    running = true; stopFlag = false;
    const trigger = () => document.querySelector('button[data-slot="alert-dialog-trigger"][data-variant="destructive"]');
    const hover = (el) => { for (const t of ['pointerover', 'mouseover', 'pointerenter', 'mouseenter']) el.dispatchEvent(new MouseEvent(t, { bubbles: t.endsWith('over'), cancelable: true, view: window })); };
    const reveal = async () => { // the delete icons render only while an item is hovered
      if (trigger()) return trigger();
      for (const img of document.querySelectorAll('main img, img')) {
        hover(img); if (img.parentElement) hover(img.parentElement);
        const t = await waitFor(trigger, 300); if (t) return t;
      }
      return null;
    };
    const confirmDialog = () => document.querySelector('[role="alertdialog"][data-state="open"]');
    let n = 0;
    try {
      while (n < max && !stopFlag) {
        const t = await reveal(); if (!t) break;
        t.click();
        const dlg = await waitFor(confirmDialog, 3000);
        if (!dlg) { console.log('confirmation dialog did not open'); break; }
        const btn = buttonsIn(dlg, /^Remove Item$/)[0];
        if (!btn) { console.log('"Remove Item" button not found'); break; }
        btn.click();
        const gone = await waitFor(() => (!confirmDialog() && !document.contains(t)) ? true : null, cfg.timeoutMs);
        if (!gone) { console.log('item did not go away; stopping'); break; }
        n++; if (n % 10 === 0) console.log(`removed ${n}`);
        await sleep(cfg.delayMs);
      }
    } finally { running = false; }
    console.log(`removed ${n} item(s)${n === 0 ? ' (no delete icon appeared on any image; hover one item by hand and run again)' : ''}`);
    return n;
  };

  window.MFC_IMPORT = {
    run, clear, stop: () => { stopFlag = true; }, unlock: () => { running = false; }, log, last, lookup,
    reset: () => localStorage.removeItem('mfc_import_progress'),
    csv: () => ['mfc_id,title,jan,status,outcome,hobbymoe_name', ...log.map((r) => [r.id, r.title, r.jan, r.status, r.outcome, r.hobbymoe || ''].map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(','))].join('\n'),
  };
  console.log('MFC_IMPORT v11 ready. Next: MFC_IMPORT.run()   (one command per paste)');
})();
