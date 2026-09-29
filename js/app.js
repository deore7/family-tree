// ---------------------------------------------------------------------------
// App bootstrap + orchestration: loads data, wires the toolbar, manages edit
// mode (password gate), photo staging, and committing back to GitHub.
// ---------------------------------------------------------------------------
(function () {
  let editMode = false;
  let dirty = false;
  const pendingPhotos = {}; // personId -> File to upload on commit

  const $ = (id) => document.getElementById(id);

  async function boot() {
    try {
      await Store.load();
    } catch (err) {
      toast("Failed to load data: " + err.message, true);
      return;
    }
    Tree.init("#treeContainer", { onSelect: (id) => Person.showDetail(id) });
    Person.init({ onSave, onDelete, canEdit: () => editMode });
    Tree.render();
    wireToolbar();
    reflectEditState();
  }

  function wireToolbar() {
    $("btnEdit").onclick = toggleEdit;
    $("btnAdd").onclick = () => Person.openEditor(null);
    $("btnSave").onclick = commit;
    $("btnToken").onclick = openTokenDialog;
    $("btnZoomIn").onclick = () => Tree.zoomIn();
    $("btnZoomOut").onclick = () => Tree.zoomOut();
    $("btnFit").onclick = () => Tree.fit();
    $("searchBtn").onclick = doSearch;
    const input = $("searchInput");
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { hideSuggest(); doSearch(); } });
    input.addEventListener("input", renderSuggest);
    input.addEventListener("focus", renderSuggest);
    // Hide the suggestion list when focus leaves the search area.
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search")) hideSuggest();
    });
  }

  // ---------- Edit mode ----------
  async function toggleEdit() {
    if (editMode) {
      if (dirty && !confirm("You have unsaved changes. Leave edit mode without saving to GitHub?")) return;
      editMode = false;
      reflectEditState();
      return;
    }
    const ok = await unlock();
    if (ok) { editMode = true; reflectEditState(); toast("Edit mode on."); }
  }

  async function unlock() {
    if (!Auth.hasPassword()) {
      const pw = await passwordDialog(true);
      if (pw == null) return false;
      await Auth.setLocalPassword(pw);
      return true;
    }
    const pw = await passwordDialog(false);
    if (pw == null) return false;
    if (await Auth.checkPassword(pw)) return true;
    toast("Incorrect password.", true);
    return false;
  }

  function reflectEditState() {
    document.body.classList.toggle("edit-mode", editMode);
    $("btnEdit").textContent = editMode ? "Done" : "Edit";
    $("btnAdd").style.display = editMode ? "" : "none";
    $("btnToken").style.display = editMode ? "" : "none";
    $("btnSave").style.display = editMode ? "" : "none";
    $("btnSave").disabled = !dirty;
    $("btnSave").textContent = dirty ? "Save to GitHub *" : "Save to GitHub";
  }

  function markDirty() { dirty = true; reflectEditState(); }

  // ---------- Save (person) ----------
  function onSave(data, photoFile) {
    const res = Store.upsert(data);
    if (!res.ok) { alert(res.errors.join("\n")); return; }
    if (photoFile) {
      pendingPhotos[res.person.id] = photoFile;
      res.person._photoPreview = URL.createObjectURL(photoFile);
    }
    Person.closeEditor();
    markDirty();
    Tree.render(true);
    Person.showDetail(res.person.id);
  }

  function onDelete(id) {
    const res = Store.remove(id);
    if (!res.ok) { alert(res.errors.join("\n")); return; }
    delete pendingPhotos[id];
    Person.hideDetail();
    markDirty();
    Tree.render(true);
  }

  // ---------- Commit to GitHub ----------
  async function commit() {
    if (!dirty) return;
    let token = Auth.getToken();
    if (!token) { token = await ensureToken(); if (!token) return; }

    $("btnSave").disabled = true;
    $("btnSave").textContent = "Saving…";
    try {
      await GitHub.verifyToken(token);

      // 1) upload any staged photos, updating each person's photo path
      for (const [pid, file] of Object.entries(pendingPhotos)) {
        const person = Store.get(pid);
        if (!person) continue;
        const path = await GitHub.uploadPhoto(token, file, pid);
        person.photo = path;
        delete person._photoPreview;
      }
      // 2) commit the data file
      await GitHub.putText(token, CONFIG.dataPath, Store.serialize(),
        "Update family tree (" + new Date().toISOString() + ")");

      for (const k of Object.keys(pendingPhotos)) delete pendingPhotos[k];
      dirty = false;
      reflectEditState();
      Tree.render(true);
      toast("Saved to GitHub. Pages will republish shortly.");
    } catch (err) {
      toast("Save failed: " + err.message, true);
      reflectEditState();
    }
  }

  async function ensureToken() {
    const t = await openTokenDialog();
    return t || null;
  }

  // ---------- Search ----------
  // Match against name, "firstname fathername lastname", and village.
  function matches(p, q) {
    return Store.nameWithFather(p).toLowerCase().includes(q) ||
      Store.fullName(p).toLowerCase().includes(q) ||
      (p.village || "").toLowerCase().includes(q);
  }

  function doSearch() {
    const q = $("searchInput").value.trim().toLowerCase();
    if (!q) return;
    const match = Store.all()
      .filter((p) => !Store.isDummy(p.id))
      .find((p) => matches(p, q));
    if (!match) { toast("No match for “" + q + "”.", true); return; }
    goTo(match.id);
  }

  function goTo(id) {
    hideSuggest();
    Tree.focusPerson(id);
    Person.showDetail(id);
  }

  // Live suggestion dropdown under the search box.
  function renderSuggest() {
    const box = $("searchSuggest");
    const q = $("searchInput").value.trim().toLowerCase();
    if (!q) { hideSuggest(); return; }
    const results = Store.all()
      .filter((p) => !Store.isDummy(p.id))
      .filter((p) => matches(p, q))
      .slice(0, 10);
    if (!results.length) {
      box.innerHTML = '<div class="suggest-opt muted">No matches</div>';
      box.classList.add("show");
      return;
    }
    box.innerHTML = results.map((p) =>
      '<div class="suggest-opt" data-goto="' + p.id + '">' + esc(Store.nameWithFather(p)) +
      (p.village ? ' <span class="muted">· ' + esc(p.village) + "</span>" : "") + "</div>"
    ).join("");
    box.classList.add("show");
    box.querySelectorAll("[data-goto]").forEach((el) => {
      el.onclick = () => goTo(el.getAttribute("data-goto"));
    });
  }

  function hideSuggest() {
    const box = $("searchSuggest");
    box.classList.remove("show");
    box.innerHTML = "";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- Dialogs (built dynamically) ----------
  function modalShell(innerHtml) {
    const root = $("modalRoot");
    root.innerHTML = '<div class="modal open"><div class="modal-card">' + innerHtml + "</div></div>";
    return root.querySelector(".modal");
  }
  function closeModalRoot() { $("modalRoot").innerHTML = ""; }

  function passwordDialog(creating) {
    return new Promise((resolve) => {
      const extra = creating
        ? '<p class="hint">No edit password is set yet. Create one for this device. ' +
          'Use “Copy hash” to paste it into <code>js/config.js</code> so the same password works everywhere.</p>'
        : "";
      const m = modalShell(
        "<h2>" + (creating ? "Create edit password" : "Enter edit password") + "</h2>" + extra +
        '<input type="password" id="pwInput" class="dlg-input" autocomplete="off">' +
        (creating ? '<button class="btn" id="pwCopy" type="button">Copy hash for config.js</button>' : "") +
        '<div class="form-actions"><button class="btn" id="pwCancel">Cancel</button>' +
        '<button class="btn primary" id="pwOk">' + (creating ? "Create" : "Unlock") + "</button></div>"
      );
      const input = m.querySelector("#pwInput");
      input.focus();
      const done = (v) => { closeModalRoot(); resolve(v); };
      m.querySelector("#pwCancel").onclick = () => done(null);
      m.querySelector("#pwOk").onclick = () => done(input.value);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") done(input.value); });
      if (creating) {
        m.querySelector("#pwCopy").onclick = async () => {
          const h = await Auth.sha256(input.value);
          try { await navigator.clipboard.writeText(h); toast("Hash copied. Paste into config.js passwordHash."); }
          catch (e) { prompt("Copy this hash into config.js passwordHash:", h); }
        };
      }
      m.addEventListener("click", (e) => { if (e.target === m) done(null); });
    });
  }

  function openTokenDialog() {
    return new Promise((resolve) => {
      const has = Auth.hasToken();
      const g = CONFIG.github;
      const m = modalShell(
        "<h2>GitHub token</h2>" +
        '<p class="hint">A fine-grained personal access token with <b>Contents: Read and write</b> ' +
        "on <code>" + g.owner + "/" + g.repo + "</code>. Stored only in this browser — keep it private.</p>" +
        '<input type="password" id="tkInput" class="dlg-input" placeholder="github_pat_… or ghp_…" value="">' +
        '<div class="form-actions">' +
          (has ? '<button class="btn danger" id="tkForget">Forget token</button>' : "") +
          '<button class="btn" id="tkCancel">Cancel</button>' +
          '<button class="btn primary" id="tkOk">Save token</button>' +
        "</div>"
      );
      const input = m.querySelector("#tkInput");
      if (has) input.placeholder = "•••••• (a token is stored)";
      input.focus();
      const done = (v) => { closeModalRoot(); resolve(v); };
      m.querySelector("#tkCancel").onclick = () => done(has ? Auth.getToken() : null);
      m.querySelector("#tkOk").onclick = async () => {
        const v = input.value.trim();
        if (!v) { done(has ? Auth.getToken() : null); return; }
        try {
          await GitHub.verifyToken(v);
          Auth.setToken(v);
          toast("Token saved and verified.");
          done(v);
        } catch (err) { toast("Token check failed: " + err.message, true); }
      };
      if (has) m.querySelector("#tkForget").onclick = () => { Auth.forgetToken(); toast("Token forgotten."); done(null); };
      m.addEventListener("click", (e) => { if (e.target === m) done(has ? Auth.getToken() : null); });
    });
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg, isError) {
    const el = $("toast");
    el.textContent = msg;
    el.className = "toast show" + (isError ? " error" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.className = "toast"), 4000);
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
