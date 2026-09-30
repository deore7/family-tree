// ---------------------------------------------------------------------------
// Data store: loads family.json, keeps an in-memory model, derives children,
// generates ids, validates, and keeps relationship links consistent.
// ---------------------------------------------------------------------------
window.Store = (function () {
  let state = { version: 1, people: {} };

  const DUMMY_FATHER = "dummy-father";
  const DUMMY_MOTHER = "dummy-mother";

  // A location group: village/taluka/district/pincode. Used for the person's
  // native place and for their maher (parental home) and sasar (in-laws' home).
  function blankLocation() {
    return { village: "", taluka: "", district: "", pincode: "" };
  }
  function normalizeLocation(loc) {
    return Object.assign(blankLocation(), loc || {});
  }

  function blankPerson() {
    return {
      id: "",
      firstName: "",
      lastName: "",
      gender: "male",
      isDefault: false,
      alive: true,
      spouseIds: [],
      fatherIds: [],
      motherIds: [],
      dob: "",
      dod: "",
      photo: "",
      village: "",
      taluka: "",
      district: "",
      pincode: "",
      phone: "",
      current: blankLocation(),
      maher: blankLocation(),
      sasar: blankLocation(),
    };
  }

  // Ensure every person has all fields so the rest of the app can rely on them.
  function normalizePerson(p) {
    return Object.assign(blankPerson(), p, {
      // Missing `alive` (older data) defaults to true.
      alive: p.alive === undefined ? true : !!p.alive,
      spouseIds: (p.spouseIds || []).slice(),
      fatherIds: (p.fatherIds || []).slice(),
      motherIds: (p.motherIds || []).slice(),
      current: normalizeLocation(p.current),
      maher: normalizeLocation(p.maher),
      sasar: normalizeLocation(p.sasar),
    });
  }

  async function load() {
    // Cache-bust so freshly committed data shows up without a hard refresh.
    const url = CONFIG.dataPath + "?t=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load " + CONFIG.dataPath + " (" + res.status + ")");
    const raw = await res.json();
    state = { version: raw.version || 1, people: {} };
    Object.values(raw.people || {}).forEach((p) => {
      state.people[p.id] = normalizePerson(p);
    });
    ensureDummies();
    return state;
  }

  function ensureDummies() {
    if (!state.people[DUMMY_FATHER]) {
      state.people[DUMMY_FATHER] = normalizePerson({
        id: DUMMY_FATHER, firstName: "Ancestor", lastName: "(Father)",
        gender: "male", isDefault: true, spouseIds: [DUMMY_MOTHER],
      });
    }
    if (!state.people[DUMMY_MOTHER]) {
      state.people[DUMMY_MOTHER] = normalizePerson({
        id: DUMMY_MOTHER, firstName: "Ancestor", lastName: "(Mother)",
        gender: "female", isDefault: true, spouseIds: [DUMMY_FATHER],
      });
    }
    state.people[DUMMY_FATHER].isDefault = true;
    state.people[DUMMY_MOTHER].isDefault = true;
  }

  function all() { return Object.values(state.people); }
  function get(id) { return state.people[id]; }
  function isDummy(id) { return id === DUMMY_FATHER || id === DUMMY_MOTHER; }
  function getState() { return state; }

  function fullName(p) {
    if (!p) return "Unknown";
    return (p.firstName + " " + p.lastName).trim() || "Unnamed";
  }

  // First non-default father's first name (patronymic), or "".
  function fatherFirstName(p) {
    if (!p) return "";
    const fid = (p.fatherIds || []).find((id) => id && !isDummy(id) && get(id));
    return fid ? get(fid).firstName : "";
  }

  // "firstName fatherFirstName lastName" when a real father exists, else full name.
  function nameWithFather(p) {
    if (!p) return "Unknown";
    const ff = fatherFirstName(p);
    return [p.firstName, ff, p.lastName].filter((s) => s && s.trim()).join(" ") || fullName(p);
  }

  // Children = anyone who lists this person as a father or mother.
  function childrenOf(id) {
    return all().filter(
      (p) => p.fatherIds.includes(id) || p.motherIds.includes(id)
    );
  }
  function sonsOf(id) { return childrenOf(id).filter((p) => p.gender === "male"); }
  function daughtersOf(id) { return childrenOf(id).filter((p) => p.gender === "female"); }

  function parentsOf(id) {
    const p = get(id);
    if (!p) return [];
    return p.fatherIds.concat(p.motherIds).map(get).filter(Boolean);
  }
  function spousesOf(id) {
    const p = get(id);
    if (!p) return [];
    return p.spouseIds.map(get).filter(Boolean);
  }

  function newId() {
    return "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }

  function addUnique(arr, id) { if (id && !arr.includes(id)) arr.push(id); }
  function removeFrom(arr, id) {
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
  }

  // Validate required fields. Returns array of error strings (empty = ok).
  function validate(data) {
    const errors = [];
    if (!data.firstName || !data.firstName.trim()) errors.push("First name is required.");
    if (!data.lastName || !data.lastName.trim()) errors.push("Last name is required.");
    if (!(data.fatherIds && data.fatherIds.length)) errors.push("At least one father is required.");
    if (!(data.motherIds && data.motherIds.length)) errors.push("At least one mother is required.");
    if (!data.village || !data.village.trim()) errors.push("Village is required.");
    if (!data.taluka || !data.taluka.trim()) errors.push("Taluka is required.");
    if (!data.district || !data.district.trim()) errors.push("District is required.");
    return errors;
  }

  // Keep spouse links mutual. `next`/`prev` are arrays of spouse ids.
  function syncSpouses(personId, prev, next) {
    prev.forEach((sid) => {
      if (!next.includes(sid) && get(sid)) removeFrom(get(sid).spouseIds, personId);
    });
    next.forEach((sid) => {
      if (get(sid)) addUnique(get(sid).spouseIds, personId);
    });
  }

  // Create or update a person. `data` is a partial person object.
  // Returns { ok, errors, person }.
  function upsert(data) {
    const errors = validate(data);
    if (errors.length) return { ok: false, errors };

    const isNew = !data.id || !state.people[data.id];
    const id = isNew ? newId() : data.id;
    const prev = state.people[id] ? state.people[id] : normalizePerson({ id });
    const prevSpouses = prev.spouseIds.slice();

    if (prev.isDefault) {
      return { ok: false, errors: ["The default ancestors cannot be edited."] };
    }

    const person = normalizePerson(Object.assign({}, prev, data, { id, isDefault: false }));
    // Trim text fields.
    ["firstName", "lastName", "village", "taluka", "district", "pincode", "phone", "photo"].forEach((k) => {
      if (typeof person[k] === "string") person[k] = person[k].trim();
    });
    ["current", "maher", "sasar"].forEach((grp) => {
      ["village", "taluka", "district", "pincode"].forEach((k) => {
        if (typeof person[grp][k] === "string") person[grp][k] = person[grp][k].trim();
      });
    });

    state.people[id] = person;
    syncSpouses(id, prevSpouses, person.spouseIds);
    return { ok: true, errors: [], person };
  }

  // Delete a person and scrub references to them from everyone else.
  function remove(id) {
    const p = get(id);
    if (!p) return { ok: false, errors: ["Person not found."] };
    if (p.isDummy || p.isDefault) return { ok: false, errors: ["The default ancestors cannot be deleted."] };
    delete state.people[id];
    all().forEach((other) => {
      removeFrom(other.fatherIds, id);
      removeFrom(other.motherIds, id);
      removeFrom(other.spouseIds, id);
    });
    return { ok: true, errors: [] };
  }

  // Serialize for saving (drop derived/UI-only bits — we keep only real fields).
  function serialize() {
    const people = {};
    all().forEach((p) => {
      people[p.id] = {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        gender: p.gender,
        alive: p.alive !== false,
        spouseIds: p.spouseIds,
        fatherIds: p.fatherIds,
        motherIds: p.motherIds,
        dob: p.dob,
        dod: p.dod,
        photo: p.photo,
        village: p.village,
        taluka: p.taluka,
        district: p.district,
        pincode: p.pincode,
        phone: p.phone,
        current: normalizeLocation(p.current),
        maher: normalizeLocation(p.maher),
        sasar: normalizeLocation(p.sasar),
      };
      if (p.isDefault) people[p.id].isDefault = true;
    });
    return JSON.stringify({ version: state.version || 1, people }, null, 2) + "\n";
  }

  return {
    DUMMY_FATHER, DUMMY_MOTHER,
    load, all, get, getState, isDummy, fullName, fatherFirstName, nameWithFather, blankPerson,
    childrenOf, sonsOf, daughtersOf, parentsOf, spousesOf,
    validate, upsert, remove, serialize, newId,
  };
})();
