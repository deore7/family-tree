// ---------------------------------------------------------------------------
// Edit-mode gate: a light password check (SHA-256 hash compare) plus storage
// of the GitHub token used to commit changes. Neither is real server-side
// security — the token is the true write credential and lives in this browser.
// ---------------------------------------------------------------------------
window.Auth = (function () {
  const TOKEN_KEY = "familytree.token";
  const LOCAL_HASH_KEY = "familytree.pwhash";

  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // The configured hash wins; otherwise a per-device hash set on first use.
  function currentHash() {
    return (CONFIG.passwordHash || "").trim() || localStorage.getItem(LOCAL_HASH_KEY) || "";
  }
  function hasPassword() { return !!currentHash(); }

  async function checkPassword(password) {
    const h = await sha256(password);
    return h === currentHash();
  }

  async function setLocalPassword(password) {
    const h = await sha256(password);
    localStorage.setItem(LOCAL_HASH_KEY, h);
    return h;
  }

  function getToken() { return localStorage.getItem(TOKEN_KEY) || ""; }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t.trim()); }
  function hasToken() { return !!getToken(); }
  function forgetToken() { localStorage.removeItem(TOKEN_KEY); }

  return {
    sha256, hasPassword, checkPassword, setLocalPassword,
    getToken, setToken, hasToken, forgetToken,
  };
})();
