// ---------------------------------------------------------------------------
// App configuration.
// ---------------------------------------------------------------------------
window.CONFIG = {
  // The family data (source of truth). The app renders live from this CSV.
  // You can also override it per-visit with ?csv=path/to/file.csv
  dataPath: "data/family_template.csv",

  // Branches deeper than this start collapsed (keeps large trees fast).
  // 3 = three generations (top-level people, their children and grandchildren)
  // are shown by default. Set to a large number to expand everything.
  collapseDepth: 3,
};
