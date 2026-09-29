// ---------------------------------------------------------------------------
// GitHub Contents API wrapper — reads and writes files in the repo so that
// edits made in the browser get committed back and republished by Pages.
// Requires a fine-grained personal access token with Contents: read & write.
// ---------------------------------------------------------------------------
window.GitHub = (function () {
  function base() {
    const g = CONFIG.github;
    return "https://api.github.com/repos/" + g.owner + "/" + g.repo + "/contents/";
  }

  function headers(token) {
    return {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  // Encode a UTF-8 string to base64.
  function b64EncodeUnicode(str) {
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(parseInt(p1, 16))
      )
    );
  }

  // Encode an ArrayBuffer (binary) to base64.
  function b64FromArrayBuffer(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  async function apiError(res) {
    let detail = "";
    try { detail = (await res.json()).message || ""; } catch (e) {}
    return new Error("GitHub API " + res.status + (detail ? ": " + detail : ""));
  }

  // Get a file's current sha (needed to update it). Returns null if missing.
  async function getSha(token, path) {
    const url = base() + encodeURIComponent(path).replace(/%2F/g, "/") +
      "?ref=" + encodeURIComponent(CONFIG.github.branch);
    const res = await fetch(url, { headers: headers(token) });
    if (res.status === 404) return null;
    if (!res.ok) throw await apiError(res);
    const json = await res.json();
    return json.sha;
  }

  // Create or update a text file. Returns the commit response.
  async function putText(token, path, text, message) {
    const sha = await getSha(token, path);
    return put(token, path, b64EncodeUnicode(text), message, sha);
  }

  // Create or update a binary file from base64 content.
  async function put(token, path, base64Content, message, sha) {
    const url = base() + encodeURIComponent(path).replace(/%2F/g, "/");
    const body = {
      message: message || ("Update " + path),
      content: base64Content,
      branch: CONFIG.github.branch,
    };
    if (sha) body.sha = sha;
    const res = await fetch(url, {
      method: "PUT",
      headers: Object.assign(headers(token), { "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await apiError(res);
    return res.json();
  }

  // Upload a photo File; returns the repo-relative path to store in person.photo.
  async function uploadPhoto(token, file, personId) {
    const buffer = await file.arrayBuffer();
    const safe = (file.name || "photo").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = CONFIG.photosDir + "/" + personId + "-" + Date.now() + "-" + safe;
    const sha = await getSha(token, path);
    await put(token, path, b64FromArrayBuffer(buffer), "Add photo for " + personId, sha);
    return path;
  }

  // Sanity check that the token can read the repo. Returns true/throws.
  async function verifyToken(token) {
    const url = "https://api.github.com/repos/" + CONFIG.github.owner + "/" + CONFIG.github.repo;
    const res = await fetch(url, { headers: headers(token) });
    if (!res.ok) throw await apiError(res);
    return true;
  }

  return { getSha, putText, uploadPhoto, verifyToken };
})();
