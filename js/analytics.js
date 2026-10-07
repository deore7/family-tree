// ---------------------------------------------------------------------------
// Top-of-page analytics: total people and the number of distinct villages
// across everyone's maher (parental home) and sasar (in-laws' home) locations.
// ---------------------------------------------------------------------------
window.Analytics = (function () {
  function people() {
    return Store.all().filter((p) => !Store.isDummy(p.id));
  }

  // Distinct, case-insensitive village names drawn from maher + sasar.
  function villageSet() {
    const set = new Set();
    people().forEach((p) => {
      [p.maher, p.sasar].forEach((loc) => {
        const v = ((loc && loc.village) || "").trim().toLowerCase();
        if (v) set.add(v);
      });
    });
    return set;
  }

  function compute() {
    return { people: people().length, villages: villageSet().size };
  }

  function statHtml(value, label) {
    return '<div class="stat"><span class="stat-num">' + value +
      '</span><span class="stat-label">' + label + "</span></div>";
  }

  function render(containerSel) {
    const el = typeof containerSel === "string"
      ? document.querySelector(containerSel) : containerSel;
    if (!el) return;
    const s = compute();
    el.innerHTML =
      statHtml(s.people, s.people === 1 ? "person" : "people") +
      statHtml(s.villages, "villages (maher + sasar)");
  }

  return { compute, render };
})();
