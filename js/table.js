// ---------------------------------------------------------------------------
// People table view: a sortable, filterable overlay listing everyone. Clicking
// a row focuses that person in the tree and opens their detail panel.
// Needs an element <div id="peopleTableOverlay" class="table-overlay"> in the
// page and (optionally) an onPick(id) callback supplied via init().
// ---------------------------------------------------------------------------
window.PeopleTable = (function () {
  let overlay, onPick = function () {};
  let sortKey = "name", sortDir = 1; // 1 asc, -1 desc

  // Column definitions: key, header label, and value accessor for a person.
  const COLUMNS = [
    { key: "name", label: "Name", get: (p) => Store.nameWithFather(p) },
    { key: "gender", label: "Gender", get: (p) => cap(p.gender) },
    { key: "status", label: "Status", get: (p) => (p.alive === false ? "Deceased" : "Living") },
    { key: "married", label: "Married", get: (p) => (p.married ? "Yes" : "No") },
    { key: "village", label: "Native", get: (p) => p.village || "" },
    { key: "maher", label: "Maher", get: (p) => (p.maher && p.maher.village) || "" },
    { key: "sasar", label: "Sasar", get: (p) => (p.sasar && p.sasar.village) || "" },
    { key: "father", label: "Father(s)", get: (p) => names(p.fatherIds) },
    { key: "mother", label: "Mother(s)", get: (p) => names(p.motherIds) },
    { key: "spouse", label: "Spouse(s)", get: (p) => names(p.spouseIds) },
    { key: "phone", label: "Phone", get: (p) => p.phone || "" },
  ];

  function init(opts) {
    opts = opts || {};
    onPick = opts.onPick || onPick;
    overlay = document.getElementById("peopleTableOverlay");
    if (overlay) {
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    }
  }

  function names(ids) {
    return (ids || [])
      .map(Store.get).filter(Boolean).filter((p) => !Store.isDummy(p.id))
      .map(Store.fullName).join(", ");
  }
  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : ""; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function rows() {
    return Store.all()
      .filter((p) => !Store.isDummy(p.id))
      .map((p) => {
        const r = { id: p.id, _p: p };
        COLUMNS.forEach((c) => { r[c.key] = c.get(p); });
        return r;
      });
  }

  function open() {
    if (!overlay) return;
    overlay.innerHTML =
      '<div class="table-card">' +
        '<div class="table-head">' +
          "<h2>People</h2>" +
          '<div class="table-filters">' +
            '<input id="tblFilter" type="search" placeholder="Filter by name or village…" autocomplete="off">' +
            '<select id="tblGender"><option value="">All genders</option>' +
              '<option value="male">Male</option><option value="female">Female</option>' +
              '<option value="other">Other</option></select>' +
            '<select id="tblStatus"><option value="">All</option>' +
              '<option value="living">Living</option><option value="deceased">Deceased</option></select>' +
            '<span id="tblCount" class="muted"></span>' +
          "</div>" +
          '<button id="tblClose" class="btn" aria-label="Close">Close</button>' +
        "</div>" +
        '<div class="table-scroll"><table class="people-table"><thead><tr>' +
          COLUMNS.map((c) => '<th data-sort="' + c.key + '">' + esc(c.label) + "</th>").join("") +
        "</tr></thead><tbody id=\"tblBody\"></tbody></table></div>" +
      "</div>";
    overlay.classList.add("open");

    document.getElementById("tblClose").onclick = close;
    const fEl = document.getElementById("tblFilter");
    const gEl = document.getElementById("tblGender");
    const sEl = document.getElementById("tblStatus");
    [fEl, gEl, sEl].forEach((el) => el.addEventListener("input", draw));
    overlay.querySelectorAll("th[data-sort]").forEach((th) => {
      th.onclick = () => {
        const k = th.getAttribute("data-sort");
        if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; }
        draw();
      };
    });
    fEl.focus();
    draw();
  }

  function close() { if (overlay) overlay.classList.remove("open"); }

  function draw() {
    const q = (document.getElementById("tblFilter").value || "").trim().toLowerCase();
    const g = document.getElementById("tblGender").value;
    const st = document.getElementById("tblStatus").value;

    let data = rows().filter((r) => {
      if (g && r._p.gender !== g) return false;
      if (st === "living" && r._p.alive === false) return false;
      if (st === "deceased" && r._p.alive !== false) return false;
      if (q) {
        const hay = (r.name + " " + r.village + " " + r.maher + " " + r.sasar).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    data.sort((a, b) => {
      const av = (a[sortKey] || "").toString().toLowerCase();
      const bv = (b[sortKey] || "").toString().toLowerCase();
      return av < bv ? -sortDir : av > bv ? sortDir : 0;
    });

    document.getElementById("tblCount").textContent =
      data.length + " of " + rows().length;

    overlay.querySelectorAll("th[data-sort]").forEach((th) => {
      const k = th.getAttribute("data-sort");
      th.classList.toggle("sorted", k === sortKey);
      th.setAttribute("data-dir", k === sortKey ? (sortDir > 0 ? "▲" : "▼") : "");
    });

    document.getElementById("tblBody").innerHTML = data.map((r) =>
      '<tr data-id="' + esc(r.id) + '">' +
        COLUMNS.map((c) => "<td>" + esc(r[c.key]) + "</td>").join("") +
      "</tr>").join("");

    overlay.querySelectorAll("tbody tr").forEach((tr) => {
      tr.onclick = () => { close(); onPick(tr.getAttribute("data-id")); };
    });
  }

  return { init, open, close };
})();
