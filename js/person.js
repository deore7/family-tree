// ---------------------------------------------------------------------------
// Person detail panel + add/edit/delete form (modal). UI only — actual saving,
// photo upload and committing is delegated to callbacks supplied by app.js.
// ---------------------------------------------------------------------------
window.Person = (function () {
  let cb = {};            // { onSave(data, photoFile), onDelete(id), canEdit() }
  let modal, form, detailPanel;
  let currentPhotoFile = null;
  // Last pincode result per location group ("" native / "maher" / "sasar"),
  // used to keep taluka/district in sync when a village is chosen.
  let lastLookup = {};

  function init(callbacks) {
    cb = callbacks || {};
    modal = document.getElementById("editorModal");
    form = document.getElementById("editorForm");
    detailPanel = document.getElementById("detailPanel");
    modal.addEventListener("click", (e) => { if (e.target === modal) closeEditor(); });
    form.addEventListener("submit", onSubmit);
  }

  // ---------- Detail panel ----------
  function showDetail(id) {
    const p = Store.get(id);
    if (!p) return;
    const parents = Store.parentsOf(id);
    const spouses = Store.spousesOf(id);
    const sons = Store.sonsOf(id);
    const daughters = Store.daughtersOf(id);
    const canEdit = cb.canEdit && cb.canEdit();

    const rows = [];
    const add = (label, val) => { if (val) rows.push(rowHtml(label, val)); };
    add("Gender", cap(p.gender));
    add("Status", p.alive === false ? "Deceased" : "Living");
    add("Born", p.dob);
    add("Died", p.dod);
    add("Village", p.village);
    add("Taluka", p.taluka);
    add("District", p.district);
    add("Pincode", p.pincode);
    add("Current", locSummary(p.current));
    add("Maher", locSummary(p.maher));
    add("Sasar", locSummary(p.sasar));
    add("Phone", p.phone ? '<a href="tel:' + esc(p.phone) + '">' + esc(p.phone) + "</a>" : "");
    add("Father(s)", linkList(p.fatherIds));
    add("Mother(s)", linkList(p.motherIds));
    add("Spouse(s)", linkList(p.spouseIds));
    add("Sons", nameList(sons));
    add("Daughters", nameList(daughters));

    detailPanel.innerHTML =
      '<button class="panel-close" id="detailClose" aria-label="Close">×</button>' +
      '<div class="detail-head">' +
        avatarHtml(p) +
        '<div><h2>' + esc(Store.fullName(p)) + "</h2>" +
        (p.isDefault ? '<span class="badge">default ancestor</span>' : "") +
        "</div></div>" +
      '<div class="detail-body">' + rows.join("") + "</div>" +
      (canEdit && !p.isDefault
        ? '<div class="detail-actions">' +
            '<button id="detailEdit" class="btn">Edit</button>' +
            '<button id="detailAddChild" class="btn">Add child</button>' +
            '<button id="detailDelete" class="btn danger">Delete</button>' +
          "</div>"
        : p.isDefault
        ? '<p class="muted">The default ancestors cannot be edited or deleted.</p>'
        : "");

    detailPanel.classList.add("open");
    document.getElementById("detailClose").onclick = hideDetail;
    if (canEdit && !p.isDefault) {
      document.getElementById("detailEdit").onclick = () => openEditor(id);
      document.getElementById("detailDelete").onclick = () => confirmDelete(id);
      document.getElementById("detailAddChild").onclick = () => openEditor(null, id);
    }
    // clicking a related person's link navigates
    detailPanel.querySelectorAll("[data-goto]").forEach((el) => {
      el.onclick = (e) => { e.preventDefault(); showDetail(el.getAttribute("data-goto")); Tree.focusPerson(el.getAttribute("data-goto")); };
    });
  }

  function hideDetail() { detailPanel.classList.remove("open"); }

  function confirmDelete(id) {
    if (confirm("Delete " + Store.fullName(Store.get(id)) + "? This cannot be undone.")) {
      cb.onDelete && cb.onDelete(id);
    }
  }

  // ---------- Editor form ----------
  // parentSeedId: when adding a child, preselect this person as a parent.
  function openEditor(id, parentSeedId) {
    currentPhotoFile = null;
    const editing = !!id;
    const p = editing ? Store.get(id) : Store.blankPerson();
    if (p.isDefault) { alert("The default ancestors cannot be edited."); return; }

    const others = Store.all().filter((x) => x.id !== id);
    const fathers = editing ? p.fatherIds.slice() : [];
    const mothers = editing ? p.motherIds.slice() : [];
    const spouses = editing ? p.spouseIds.slice() : [];
    if (parentSeedId) {
      const seed = Store.get(parentSeedId);
      if (seed && seed.gender === "female") mothers.push(parentSeedId);
      else fathers.push(parentSeedId);
    }

    form.innerHTML =
      '<h2>' + (editing ? "Edit person" : "Add person") + "</h2>" +
      '<div class="form-errors" id="formErrors"></div>' +
      // Required fields first: parents, then name (last name is prefilled from
      // the father), then location.
      field("Father(s) *", pickerHtml("fathers", fathers, "male")) +
      field("Mother(s) *", pickerHtml("mothers", mothers, "female")) +
      field("First name *", inputHtml("firstName", p.firstName)) +
      field("Last name *", inputHtml("lastName", p.lastName)) +
      locationHtml(p, "", "Native place") +
      // Everything else is tucked behind a "More details" toggle.
      '<button type="button" class="more-toggle" id="moreToggle" aria-expanded="false">' +
        "▸ More details</button>" +
      '<div class="more-details" id="moreDetails" style="display:none">' +
        field("Gender", selectHtml("gender", p.gender, [["male","Male"],["female","Female"],["other","Other"]])) +
        checkboxField("alive", "Living (currently alive)", p.alive !== false) +
        field("Date of birth", inputHtml("dob", p.dob, "date")) +
        field("Date of death", inputHtml("dod", p.dod, "date")) +
        field("Phone", inputHtml("phone", p.phone, "tel")) +
        field("Photo", photoHtml(p)) +
        locationHtml(p.current, "current", "Current location") +
        locationHtml(p.maher, "maher", "Maher (parental home)") +
        locationHtml(p.sasar, "sasar", "Sasar (in-laws' home)") +
        field("Spouse(s)", pickerHtml("spouses", spouses)) +
      "</div>" +
      '<input type="hidden" name="id" value="' + esc(id || "") + '">' +
      '<div class="form-actions">' +
        '<button type="button" class="btn" id="editorCancelInline">Cancel</button>' +
        '<button type="submit" class="btn primary">Save</button>' +
      "</div>";

    // wire pickers + photo + location
    wirePicker("fathers");
    wirePicker("mothers");
    wirePicker("spouses");
    wirePhoto();
    wireLocation(p, "");
    wireLocation(p.current, "current");
    wireLocation(p.maher, "maher");
    wireLocation(p.sasar, "sasar");
    wireMoreToggle();
    document.getElementById("editorCancelInline").onclick = closeEditor;

    modal.classList.add("open");
  }

  function closeEditor() { modal.classList.remove("open"); }

  // Expand/collapse the optional "More details" section.
  function wireMoreToggle() {
    const btn = document.getElementById("moreToggle");
    const box = document.getElementById("moreDetails");
    btn.onclick = () => {
      const open = box.style.display === "none";
      box.style.display = open ? "" : "none";
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.textContent = (open ? "▾" : "▸") + " More details";
    };
  }

  function onSubmit(e) {
    e.preventDefault();
    const fd = new FormData(form);
    const data = {
      id: fd.get("id") || "",
      firstName: fd.get("firstName") || "",
      lastName: fd.get("lastName") || "",
      gender: fd.get("gender") || "male",
      alive: !!(form.querySelector('input[name="alive"]') || {}).checked,
      dob: fd.get("dob") || "",
      dod: fd.get("dod") || "",
      village: getCombo("village"),
      taluka: getCombo("taluka"),
      district: getCombo("district"),
      pincode: (form.querySelector("#pincode").value || "").trim(),
      phone: fd.get("phone") || "",
      photo: fd.get("photoUrl") || (Store.get(fd.get("id")) ? Store.get(fd.get("id")).photo : "") || "",
      current: getLoc("current"),
      maher: getLoc("maher"),
      sasar: getLoc("sasar"),
      fatherIds: getPicked("fathers"),
      motherIds: getPicked("mothers"),
      spouseIds: getPicked("spouses"),
    };
    const errors = Store.validate(data);
    if (errors.length) { showErrors(errors); return; }
    cb.onSave && cb.onSave(data, currentPhotoFile);
  }

  function showErrors(errors) {
    const box = document.getElementById("formErrors");
    box.innerHTML = errors.map((e) => "<div>• " + esc(e) + "</div>").join("");
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------- HTML helpers ----------
  function field(label, inner) {
    return '<label class="field"><span>' + label + "</span>" + inner + "</label>";
  }
  function inputHtml(name, val, type) {
    return '<input type="' + (type || "text") + '" name="' + name + '" value="' + esc(val || "") + '">';
  }
  function selectHtml(name, val, opts) {
    return '<select name="' + name + '">' +
      opts.map((o) => '<option value="' + o[0] + '"' + (o[0] === val ? " selected" : "") + ">" + o[1] + "</option>").join("") +
      "</select>";
  }
  // A single checkbox with an inline label (its own layout, not the .field grid).
  function checkboxField(name, label, checked) {
    return '<label class="check-field"><input type="checkbox" name="' + name + '"' +
      (checked ? " checked" : "") + "><span>" + label + "</span></label>";
  }
  function photoHtml(p) {
    return '<div class="photo-field">' +
      '<img id="photoPreview" class="photo-preview" alt="" src="' + esc(p.photo || "") + '"' + (p.photo ? "" : ' style="display:none"') + ">" +
      '<input type="file" id="photoFile" accept="image/*">' +
      '<input type="text" name="photoUrl" placeholder="…or paste an image URL" value="' + esc(isUrl(p.photo) ? p.photo : "") + '">' +
      '<p class="hint">Uploads are committed to the repo on save. Leave empty to use a placeholder avatar.</p>' +
      "</div>";
  }
  function pickerHtml(name, selectedIds, allowedGender) {
    const chips = selectedIds.map((id) => chipHtml(name, id)).join("");
    return '<div class="picker" data-picker="' + name + '"' +
      (allowedGender ? ' data-gender="' + allowedGender + '"' : "") + ">" +
      '<div class="chips" data-chips="' + name + '">' + chips + "</div>" +
      '<input type="text" class="picker-search" data-search="' + name + '" placeholder="Search to add…" autocomplete="off">' +
      '<div class="picker-list" data-list="' + name + '"></div>' +
      "</div>";
  }
  function chipHtml(name, id) {
    return '<span class="chip" data-id="' + id + '">' + esc(Store.nameWithFather(Store.get(id))) +
      '<button type="button" class="chip-x" data-remove="' + name + '" data-id="' + id + '">×</button></span>';
  }

  // Match a person against a query across name, father-inclusive name, and village.
  function matchesQuery(p, q) {
    return Store.nameWithFather(p).toLowerCase().includes(q) ||
      Store.fullName(p).toLowerCase().includes(q) ||
      (p.village || "").toLowerCase().includes(q);
  }

  function wirePicker(name) {
    const wrap = form.querySelector('[data-picker="' + name + '"]');
    const search = wrap.querySelector('[data-search="' + name + '"]');
    const list = wrap.querySelector('[data-list="' + name + '"]');
    const chips = wrap.querySelector('[data-chips="' + name + '"]');
    const allowedGender = wrap.getAttribute("data-gender"); // "male"/"female"/null

    function picked() {
      return Array.from(chips.querySelectorAll(".chip")).map((c) => c.getAttribute("data-id"));
    }
    function renderList() {
      const q = search.value.trim().toLowerCase();
      const already = picked();
      const selfId = form.querySelector('input[name="id"]').value;
      // With no query we still list eligible people (so the default ancestors
      // are discoverable) — the query just narrows the list.
      const matches = Store.all()
        .filter((p) => p.id !== selfId && !already.includes(p.id))
        .filter((p) => !allowedGender || p.gender === allowedGender)
        .filter((p) => !q || matchesQuery(p, q))
        .slice(0, 12);
      list.innerHTML = matches.map((p) =>
        '<div class="picker-opt" data-add="' + p.id + '">' + esc(Store.nameWithFather(p)) +
        (p.village ? ' <span class="muted">· ' + esc(p.village) + "</span>" : "") + "</div>"
      ).join("") || '<div class="picker-opt muted">No matches</div>';
      list.classList.add("show");
    }
    function addPick(id) {
      // Picking a real parent replaces the placeholder ancestor chip so the
      // tree links to the real parent instead of the default ancestor.
      if (!Store.isDummy(id)) {
        chips.querySelectorAll(".chip").forEach((c) => {
          if (Store.isDummy(c.getAttribute("data-id"))) c.remove();
        });
      }
      chips.insertAdjacentHTML("beforeend", chipHtml(name, id));
      search.value = ""; renderList(); wireChips(chips, name);
      // New member inherits last name + location from a real father.
      if (name === "fathers" && !Store.isDummy(id) && !form.querySelector('input[name="id"]').value) {
        inheritLastNameFrom(id);
        inheritLocationFrom(id);
      }
    }
    search.addEventListener("input", renderList);
    search.addEventListener("focus", renderList);
    // Hide the list when focus leaves (after a beat so a pick can register).
    search.addEventListener("blur", () => setTimeout(() => list.classList.remove("show"), 150));
    // Use mousedown + preventDefault so the pick registers before the search
    // input loses focus (a plain click can be swallowed by the blur).
    list.addEventListener("mousedown", (e) => {
      const opt = e.target.closest("[data-add]");
      if (!opt) return;
      e.preventDefault();
      addPick(opt.getAttribute("data-add"));
    });
    wireChips(chips, name);
  }

  // Prefill an empty last name from a person's last name (for new members).
  function inheritLastNameFrom(personId) {
    const src = Store.get(personId);
    const ln = form.querySelector('input[name="lastName"]');
    if (src && ln && !ln.value.trim() && src.lastName) ln.value = src.lastName;
  }

  // Copy village/taluka/district/pincode from a person into any empty fields.
  function inheritLocationFrom(personId) {
    const src = Store.get(personId);
    if (!src) return;
    const pin = form.querySelector("#pincode");
    if (pin && !pin.value && src.pincode) pin.value = src.pincode;
    if (!getCombo("village") && src.village) setCombo("village", src.village);
    if (!getCombo("taluka") && src.taluka) setCombo("taluka", src.taluka);
    if (!getCombo("district") && src.district) setCombo("district", src.district);
  }

  function wireChips(chips, name) {
    chips.querySelectorAll('[data-remove="' + name + '"]').forEach((btn) => {
      btn.onclick = () => btn.closest(".chip").remove();
    });
  }

  function getPicked(name) {
    const chips = form.querySelector('[data-chips="' + name + '"]');
    return Array.from(chips.querySelectorAll(".chip")).map((c) => c.getAttribute("data-id"));
  }

  // ---------- Location (pincode + village/taluka/district dropdowns) ----------
  // Location groups: "" = native place (required), "maher" = parental home,
  // "sasar" = in-laws' home. All three reuse the same combo + pincode machinery,
  // keyed by a group prefix so their field names and element ids don't collide.
  function fk(g, name) { return g ? g + "_" + name : name; }
  function pinId(g) { return g ? g + "Pincode" : "pincode"; }
  function pinLookupId(g) { return g ? g + "PincodeLookup" : "pincodeLookup"; }
  function pinStatusId(g) { return g ? g + "PincodeStatus" : "pincodeStatus"; }
  function groupOf(field) {
    if (field.indexOf("current_") === 0) return "current";
    if (field.indexOf("maher_") === 0) return "maher";
    if (field.indexOf("sasar_") === 0) return "sasar";
    return "";
  }

  function locationHtml(loc, g, title) {
    loc = loc || {};
    const req = g ? "" : " *"; // only the native place is required
    return '<div class="location">' +
      (title ? '<div class="loc-title">' + esc(title) + "</div>" : "") +
      field("Pincode (India)",
        '<div class="pincode-row">' +
          '<input type="text" id="' + pinId(g) + '" inputmode="numeric" maxlength="6" ' +
            'placeholder="e.g. 380001" value="' + esc(loc.pincode || "") + '">' +
          '<button type="button" class="btn" id="' + pinLookupId(g) + '">Look up</button>' +
        "</div>" +
        '<p class="hint" id="' + pinStatusId(g) + '">Enter a 6-digit pincode to fill the fields below, or choose “Other” to type manually.</p>') +
      field("Village / Area" + req, comboHtml(fk(g, "village"), [], loc.village)) +
      field("Taluka" + req, comboHtml(fk(g, "taluka"), [], loc.taluka)) +
      field("District" + req, comboHtml(fk(g, "district"), [], loc.district)) +
      "</div>";
  }

  // A <select> of options plus an "Other (type manually)" escape hatch that
  // reveals a text input. `current` preselects a value even if not in options.
  function comboHtml(field, options, current) {
    const inList = current && options.some((o) => o.toLowerCase() === current.toLowerCase());
    const useOther = current && !inList;
    const opts = ['<option value="">— select —</option>']
      .concat(options.map((o) =>
        '<option value="' + esc(o) + '"' + (inList && o.toLowerCase() === current.toLowerCase() ? " selected" : "") + ">" + esc(o) + "</option>"))
      .concat('<option value="__other__"' + (useOther ? " selected" : "") + ">Other (type manually)</option>");
    return '<div class="combo" data-combo="' + field + '">' +
      '<select data-sel="' + field + '">' + opts.join("") + "</select>" +
      '<input type="text" data-other="' + field + '" placeholder="Type ' + field + '" ' +
        'value="' + esc(useOther ? current : "") + '"' + (useOther ? "" : ' style="display:none"') + ">" +
      "</div>";
  }

  // Rebuild a combo's options after a lookup, keeping the current value selected.
  function populateCombo(field, options) {
    const wrap = form.querySelector('[data-combo="' + field + '"]');
    const current = getCombo(field);
    wrap.querySelector('[data-sel="' + field + '"]').outerHTML =
      comboReplacementSelect(field, options, current);
    const other = wrap.querySelector('[data-other="' + field + '"]');
    const useOther = current && !options.some((o) => o.toLowerCase() === current.toLowerCase());
    other.value = useOther ? current : "";
    other.style.display = useOther ? "" : "none";
    wireCombo(field);
  }
  function comboReplacementSelect(field, options, current) {
    const inList = current && options.some((o) => o.toLowerCase() === current.toLowerCase());
    const opts = ['<option value="">— select —</option>']
      .concat(options.map((o) =>
        '<option value="' + esc(o) + '"' + (inList && o.toLowerCase() === current.toLowerCase() ? " selected" : "") + ">" + esc(o) + "</option>"))
      .concat('<option value="__other__"' + (current && !inList ? " selected" : "") + ">Other (type manually)</option>");
    return '<select data-sel="' + field + '">' + opts.join("") + "</select>";
  }

  function wireCombo(field) {
    const wrap = form.querySelector('[data-combo="' + field + '"]');
    const sel = wrap.querySelector('[data-sel="' + field + '"]');
    const other = wrap.querySelector('[data-other="' + field + '"]');
    const g = groupOf(field);
    sel.onchange = () => {
      const isOther = sel.value === "__other__";
      other.style.display = isOther ? "" : "none";
      if (isOther) other.focus();
      // Picking a village auto-fills taluka + district from the pincode data.
      if (field === fk(g, "village") && lastLookup[g] && lastLookup[g].byVillage[sel.value]) {
        const info = lastLookup[g].byVillage[sel.value];
        setCombo(fk(g, "taluka"), info.taluka);
        setCombo(fk(g, "district"), info.district);
      }
    };
  }

  function getCombo(field) {
    const wrap = form.querySelector('[data-combo="' + field + '"]');
    if (!wrap) return "";
    const sel = wrap.querySelector('[data-sel="' + field + '"]');
    if (sel.value === "__other__") {
      return (wrap.querySelector('[data-other="' + field + '"]').value || "").trim();
    }
    return sel.value;
  }

  // Force a combo to a specific value (selecting the option or using Other).
  function setCombo(field, value) {
    const wrap = form.querySelector('[data-combo="' + field + '"]');
    const sel = wrap.querySelector('[data-sel="' + field + '"]');
    const other = wrap.querySelector('[data-other="' + field + '"]');
    const opt = Array.from(sel.options).find((o) => o.value.toLowerCase() === (value || "").toLowerCase());
    if (opt) { sel.value = opt.value; other.style.display = "none"; other.value = ""; }
    else if (value) { sel.value = "__other__"; other.style.display = ""; other.value = value; }
    else { sel.value = ""; other.style.display = "none"; other.value = ""; }
  }

  function wireLocation(loc, g) {
    loc = loc || {};
    wireCombo(fk(g, "village"));
    wireCombo(fk(g, "taluka"));
    wireCombo(fk(g, "district"));
    const pin = form.querySelector("#" + pinId(g));
    const btn = form.querySelector("#" + pinLookupId(g));
    // User-triggered lookups fill in the first values; the auto-lookup when
    // opening an existing person preserves their saved values instead.
    btn.onclick = () => doLookup(g, true);
    pin.addEventListener("input", () => {
      pin.value = pin.value.replace(/\D/g, "").slice(0, 6);
      if (pin.value.length === 6) doLookup(g, true);
    });
    if (loc.pincode && /^\d{6}$/.test(loc.pincode)) doLookup(g, false);
  }

  async function doLookup(g, autofill) {
    const pin = form.querySelector("#" + pinId(g)).value.trim();
    const status = form.querySelector("#" + pinStatusId(g));
    status.textContent = "Looking up " + pin + "…";
    const res = await LocationAPI.lookup(pin);
    if (!res.ok) {
      lastLookup[g] = null;
      status.textContent = res.error + " You can still choose “Other” to type manually.";
      return;
    }
    lastLookup[g] = res;
    populateCombo(fk(g, "village"), res.villages);
    populateCombo(fk(g, "taluka"), res.talukas);
    populateCombo(fk(g, "district"), res.districts);

    // Fill in the first available option for each field (unless we're keeping
    // an existing person's saved values). Taluka/district follow the chosen
    // village so they stay consistent.
    if (autofill || !getCombo(fk(g, "village"))) setCombo(fk(g, "village"), res.villages[0] || "");
    const info = res.byVillage[getCombo(fk(g, "village"))] || {};
    if (autofill || !getCombo(fk(g, "taluka"))) setCombo(fk(g, "taluka"), info.taluka || res.talukas[0] || "");
    if (autofill || !getCombo(fk(g, "district"))) setCombo(fk(g, "district"), info.district || res.districts[0] || "");

    status.textContent = "Found " + res.villages.length + " area(s) in " +
      (res.districts[0] || "") + (res.state ? ", " + res.state : "") + ".";
  }

  // Read a location group ("" native / "maher" / "sasar") back out of the form.
  function getLoc(g) {
    return {
      village: getCombo(fk(g, "village")),
      taluka: getCombo(fk(g, "taluka")),
      district: getCombo(fk(g, "district")),
      pincode: ((form.querySelector("#" + pinId(g)) || {}).value || "").trim(),
    };
  }

  // "village, taluka, district (pincode)" for the detail panel — "" if empty.
  function locSummary(loc) {
    if (!loc) return "";
    const parts = [loc.village, loc.taluka, loc.district].filter((s) => s && s.trim());
    let s = parts.join(", ");
    if (loc.pincode) s += (s ? " " : "") + "(" + loc.pincode + ")";
    return s ? esc(s) : "";
  }

  function wirePhoto() {
    const file = document.getElementById("photoFile");
    const preview = document.getElementById("photoPreview");
    file.addEventListener("change", () => {
      currentPhotoFile = file.files[0] || null;
      if (currentPhotoFile) {
        preview.src = URL.createObjectURL(currentPhotoFile);
        preview.style.display = "";
      }
    });
  }

  // ---------- small utils ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : ""; }
  function isUrl(s) { return /^https?:\/\//i.test(s || ""); }
  function rowHtml(label, val) {
    return '<div class="detail-row"><span class="dl">' + label + '</span><span class="dv">' + val + "</span></div>";
  }
  function linkList(ids) {
    return (ids || []).map((id) => {
      const p = Store.get(id);
      if (!p) return "";
      return '<a href="#" data-goto="' + id + '">' + esc(Store.fullName(p)) + "</a>";
    }).filter(Boolean).join(", ");
  }
  function nameList(people) {
    return (people || []).map((p) =>
      '<a href="#" data-goto="' + p.id + '">' + esc(Store.fullName(p)) + "</a>").join(", ");
  }
  function avatarHtml(p) {
    const src = p._photoPreview || p.photo;
    if (src) return '<img class="detail-avatar" src="' + esc(src) + '" alt="">';
    const ini = ((p.firstName[0] || "") + (p.lastName[0] || "")).toUpperCase() || "?";
    return '<div class="detail-avatar placeholder gender-' + p.gender + '">' + esc(ini) + "</div>";
  }

  return { init, showDetail, hideDetail, openEditor, closeEditor };
})();
