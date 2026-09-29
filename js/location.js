// ---------------------------------------------------------------------------
// Indian pincode lookup via the free India Post API (postalpincode.in).
// Maps a 6-digit PIN to village/area (Name), taluka (Block) and district.
// The API sends `Access-Control-Allow-Origin: *`, so it works from the browser
// on GitHub Pages with no proxy/server.
// ---------------------------------------------------------------------------
window.LocationAPI = (function () {
  const cache = {}; // pincode -> normalized result

  function uniq(arr) {
    return Array.from(new Set(arr.filter((s) => s && s.trim()).map((s) => s.trim())));
  }

  // Returns { ok, villages:[], talukas:[], districts:[], state, byVillage:{name:{taluka,district,state}}, error }
  async function lookup(pincode) {
    const pin = String(pincode || "").trim();
    if (!/^\d{6}$/.test(pin)) return { ok: false, error: "Enter a 6-digit pincode." };
    if (cache[pin]) return cache[pin];

    let json;
    try {
      const res = await fetch("https://api.postalpincode.in/pincode/" + pin, { cache: "force-cache" });
      json = await res.json();
    } catch (e) {
      return { ok: false, error: "Network error looking up pincode." };
    }

    const entry = Array.isArray(json) ? json[0] : null;
    if (!entry || entry.Status !== "Success" || !Array.isArray(entry.PostOffice)) {
      return { ok: false, error: "No records found for " + pin + "." };
    }

    const offices = entry.PostOffice;
    const byVillage = {};
    offices.forEach((o) => {
      const name = (o.Name || "").trim();
      if (name) byVillage[name] = {
        taluka: (o.Block || "").trim(),
        district: (o.District || "").trim(),
        state: (o.State || "").trim(),
      };
    });

    const result = {
      ok: true,
      villages: uniq(offices.map((o) => o.Name)),
      talukas: uniq(offices.map((o) => o.Block)),
      districts: uniq(offices.map((o) => o.District)),
      state: (offices[0].State || "").trim(),
      byVillage: byVillage,
    };
    cache[pin] = result;
    return result;
  }

  return { lookup };
})();
