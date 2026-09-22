// hobby.moe collection import from an MFC export.
// 1. Paste mfc-items.js first (defines window.MFC_ITEMS).
// 2. Be on the collection's page, logged in. 3. Paste this file. 4. MFC_IMPORT.run()  (Owned by default; run({ status: 'Wished' }) for another list)
// Stop any time with MFC_IMPORT.stop(). Progress is in localStorage under 'mfc_import_progress'; run() resumes from it.
(() => {
  const cfg = { batch: 1, delayMs: 150, searchMs: 500, timeoutMs: 4000, statuses: ['Owned'], start: null, verbose: true };
  const log = [];
  const last = { jan: '', hits: [], rows: [] };
  let stopFlag = false, running = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const txt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

  // --- capture the site's own search responses (fetch and XHR) so a row can be matched by barcode
  const captures = [];
  const remember = (url, body, text) => {
    try {
      const j = JSON.parse(text);
      if (j && Array.isArray(j.hits)) captures.push({ at: Date.now(), url: String(url), body: body ? String(body) : '', hits: j.hits });
      if (captures.length > 50) captures.splice(0, captures.length - 50);
    } catch (_) {}
  };
  if (!window.__mfcFetchPatched) {
    window.__mfcFetchPatched = true;
    const of = window.fetch;
    window.fetch = async function (input, init) {
      const res = await of.apply(this, arguments);
      try { res.clone().text().then((t) => remember(typeof input === 'string' ? input : input.url, init && init.body, t)); } catch (_) {}
      return res;
    };
    const oo = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__mfcUrl = u; return oo.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function (b) {
      this.addEventListener('load', () => { try { remember(this.__mfcUrl, b, this.responseText); } catch (_) {} });
      return os.apply(this, arguments);
    };
  }

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

  const search = async (d, jan) => {
    const t0 = Date.now();
    setInput(searchInput(d), jan);
    const cap = await waitFor(() => captures.find((c) => c.at > t0 && (c.body.includes(jan) || c.url.includes(jan) || c.hits.some((h) => h.barcode === jan))), cfg.searchMs);
    await waitFor(() => rowButtons(d).length > 0, cfg.searchMs);
    return cap ? cap.hits : null;
  };

  const one = async (item) => {
    const d = await ensureDialog();
    const hits = await search(d, item.jan);
    const exact = hits ? hits.filter((h) => h.barcode === item.jan) : null;
    const rows = rowsOf(d);
    Object.assign(last, { jan: item.jan, hits: hits || [], rows: rows.map((r) => r.text) });
    const findRow = (h) => {
      const keys = [h.name, h.characterName, h.manufacturerName, h.originName, h.version].filter((k) => k && String(k).length > 2).map(String);
      const scored = rows.map((r) => ({ r, n: keys.filter((k) => r.text.includes(k)).length }));
      const best = Math.max(0, ...scored.map((x) => x.n));
      const top = scored.filter((x) => x.n === best && best > 0);
      return top.length === 1 ? top[0].r : null;
    };
    let pick = null, outcome;
    if (exact && exact.length === 1) {
      pick = (rows.length === 1 ? rows[0] : null) || findRow(exact[0]);
      outcome = pick ? 'add' : 'already-in-collection?';
    } else if (exact && exact.length > 1) {
      const vis = exact.map(findRow).filter(Boolean);
      pick = vis.length === 1 ? vis[0] : null;
      outcome = pick ? 'add' : 'ambiguous:' + exact.map((h) => h.name + (h.version ? ' [' + h.version + ']' : '')).join(' | ');
    } else if (exact && exact.length === 0) {
      outcome = hits.length ? 'no-exact-barcode' : 'not-found';
    } else {
      pick = rows.length === 1 ? rows[0] : null;
      outcome = pick ? 'add (unverified: no search response captured)' : rows.length ? 'ambiguous-no-api' : 'not-found-or-added';
    }
    if (pick) {
      if (pick.state === 'Remove') outcome = 'already-selected';
      else { pick.button.click(); await waitFor(() => footer(d).selected > 0, 1500); }
    }
    if (cfg.verbose && outcome !== 'add') console.log(`   hits=${hits ? hits.length : 'none captured'} exact=${JSON.stringify((exact || []).map((h) => h.name))} rows=${JSON.stringify(rows.map((r) => r.text.slice(0, 90)))}`);
    return { id: item.id, title: item.title, jan: item.jan, status: item.status, outcome, hobbymoe: exact && exact[0] ? exact[0].name : '' };
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
    console.log(`importing ${items.length} items (${cfg.statuses ? cfg.statuses.join('/') : 'all statuses'})`);
    running = true;
    if (!items.length) throw new Error('window.MFC_ITEMS is empty: paste mfc-items.js first');
    let i = cfg.start ?? Number(localStorage.getItem('mfc_import_progress') || 0);
    stopFlag = false;
    let pending = 0;
    try {
    for (; i < items.length && !stopFlag; i++) {
      const it = items[i];
      if (!it.jan) { log.push({ ...it, outcome: 'no-barcode' }); continue; }
      let r;
      try { r = await one(it); } catch (e) { r = { ...it, outcome: 'error: ' + e.message }; }
      log.push(r); console.log(`${i + 1}/${items.length} ${r.outcome} | mfc ${it.id} | ${it.title}`);
      if (r.outcome === 'add' || r.outcome.startsWith('add (')) pending++;
      if (pending >= cfg.batch || (pending === 0 && openDialog())) { await commit(); pending = 0; }
      localStorage.setItem('mfc_import_progress', String(i + 1));
      await sleep(cfg.delayMs);
    }
    if (pending) await commit();
    } finally { running = false; }
    const added = log.filter((r) => r.outcome.startsWith('add')), failed = log.filter((r) => !r.outcome.startsWith('add'));
    console.log(`done: ${added.length} added, ${failed.length} not added${stopFlag ? ' (stopped)' : ''}`);
    console.table(failed.map((r) => ({ mfc: r.id, title: r.title, jan: r.jan, outcome: r.outcome })));
    return log;
  };

  window.MFC_IMPORT = {
    run, stop: () => { stopFlag = true; }, log, captures, last,
    reset: () => localStorage.removeItem('mfc_import_progress'),
    csv: () => ['mfc_id,title,jan,status,outcome,hobbymoe_name', ...log.map((r) => [r.id, r.title, r.jan, r.status, r.outcome, r.hobbymoe || ''].map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(','))].join('\n'),
  };
  console.log('MFC_IMPORT ready: MFC_IMPORT.run()  |  MFC_IMPORT.stop()  |  copy(MFC_IMPORT.csv()) for the result list');
})();
