// ---------------------------------------------------------------------------
// App configuration. Edit these values for your own GitHub repo.
// ---------------------------------------------------------------------------
window.CONFIG = {
  // GitHub repo that hosts this site + the data file (used for saving edits).
  // Example: if your site is https://alice.github.io/family-tree/
  //   owner = "alice", repo = "family-tree"
  github: {
    owner: "YOUR_GITHUB_USERNAME",
    repo: "family-tree",
    branch: "main",
  },

  // Where the data + photos live inside the repo.
  dataPath: "data/family.json",
  photosDir: "photos",

  // SHA-256 hash of the edit password.
  // Leave empty ("") to be prompted to create one on first edit (stored on this
  // device). Use the "Copy password hash" button in that dialog to paste the
  // value here so the same password works on every device.
  passwordHash: "",

  // Branches deeper than this start collapsed (keeps large trees fast).
  // 3 = three generations (top-level people, their children and grandchildren)
  // are shown by default. Set to a large number to expand everything.
  collapseDepth: 3,
};
