// ---------------------------------------------------------------------------
// Browser-side CSV -> { version, people } converter. Mirrors tools/csv_to_json.py
// so the standalone CSV viewer (csv.html) renders the same tree the committed
// data/family.json would produce — without needing to run Python.
// ---------------------------------------------------------------------------
window.CsvImport = (function () {
  const DUMMY_FATHER = "dummy-father";
  const DUMMY_MOTHER = "dummy-mother";
  const LIST_FIELDS = ["fatherIds", "motherIds", "spouseIds"];
  const REQUIRED = ["firstName", "lastName", "village", "taluka", "district"];

  const GENDER_MAP = {
    m: "male", male: "male",
    f: "female", female: "female",
    o: "other", other: "other",
  };

  // CSV column name(s) feeding each id-list field (first non-empty wins).
  const LIST_COLUMNS = {
    fatherIds: ["father_id", "fatherIds"],
    motherIds: ["mother_id", "motherIds"],
    spouseIds: ["spouse_id", "spouseIds"],
  };
  const ID_COLUMNS = ["member_id", "id"];

  // Optional location groups (native place is the flat village/... columns).
  const LOCATION_GROUPS = {
    current: ["current_village", "current_taluka", "current_district", "current_pincode"],
    maher: ["maher_village", "maher_taluka", "maher_district", "maher_pincode"],
    sasar: ["sasar_village", "sasar_taluka", "sasar_district", "sasar_pincode"],
  };
  const TRUE_WORDS = ["true", "yes", "y", "1", "alive", "living"];
  const FALSE_WORDS = ["false", "no", "n", "0", "dead", "deceased"];

  function firstValue(row, names) {
    for (const n of names) if (row[n]) return row[n];
    return "";
  }
  function splitIds(value) {
    if (!value) return [];
    return value.replace(/,/g, ";").split(";").map((s) => s.trim()).filter(Boolean);
  }
  function parseBool(value, dflt) {
    const v = (value || "").trim().toLowerCase();
    if (TRUE_WORDS.includes(v)) return true;
    if (FALSE_WORDS.includes(v)) return false;
    return dflt;
  }
  function blankLocation() { return { village: "", taluka: "", district: "", pincode: "" }; }
  function blankPerson(pid) {
    return {
      id: pid, firstName: "", lastName: "", gender: "other",
      alive: true, married: false,
      spouseIds: [], fatherIds: [], motherIds: [],
      dob: "", dod: "", photo: "",
      village: "", taluka: "", district: "", pincode: "", phone: "",
      current: blankLocation(), maher: blankLocation(), sasar: blankLocation(),
    };
  }
  function dummy(pid, first, last, gender, spouse) {
    return Object.assign(blankPerson(pid), {
      firstName: first, lastName: last, gender: gender,
      spouseIds: [spouse], isDefault: true,
    });
  }
  function addUnique(arr, value) { if (value && !arr.includes(value)) arr.push(value); }

  // ---- Minimal RFC-4180-ish CSV parser (handles quotes, commas, newlines) ----
  function parseCsv(text) {
    const rows = [];
    let row = [], field = "", inQuotes = false;
    // Strip a UTF-8 BOM if present.
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field); field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        rows.push(row); row = [];
      } else field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  // Convert CSV text to { data: {version, people}, warnings: [...] }.
  function convert(text) {
    const rows = parseCsv(text).filter((r) => r.some((c) => (c || "").trim() !== ""));
    const warnings = [];
    if (!rows.length) return { data: { version: 1, people: {} }, warnings: ["CSV is empty."] };

    const header = rows[0].map((h) => (h || "").trim());
    const people = {
      [DUMMY_FATHER]: dummy(DUMMY_FATHER, "Ancestor", "(Father)", "male", DUMMY_MOTHER),
      [DUMMY_MOTHER]: dummy(DUMMY_MOTHER, "Ancestor", "(Mother)", "female", DUMMY_FATHER),
    };
    const missingByField = {}; REQUIRED.forEach((k) => (missingByField[k] = []));

    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      const row = {};
      header.forEach((h, i) => { row[h] = (cells[i] || "").trim(); });

      const lineno = r + 1; // 1-based incl. header, to match the Python tool
      let pid = firstValue(row, ID_COLUMNS) || "row-" + lineno;
      if (!/^\d+$/.test(pid)) warnings.push("row " + lineno + ": member_id '" + pid + "' is not a whole number.");
      if (pid === DUMMY_FATHER || pid === DUMMY_MOTHER) {
        warnings.push("row " + lineno + ": id '" + pid + "' is reserved; skipped."); continue;
      }
      if (people[pid]) { warnings.push("row " + lineno + ": duplicate id '" + pid + "'; skipped."); continue; }

      const p = blankPerson(pid);
      ["firstName", "lastName", "dob", "dod", "village", "taluka", "district", "pincode", "phone", "photo"]
        .forEach((k) => { if (k in row) p[k] = row[k]; });

      const genderRaw = (row.gender || "").trim().toLowerCase();
      if (!genderRaw) p.gender = "other";
      else if (GENDER_MAP[genderRaw]) p.gender = GENDER_MAP[genderRaw];
      else { warnings.push("row " + lineno + ": unknown gender '" + genderRaw + "'; using 'other'."); p.gender = "other"; }

      // Living unless a date of death is given or a column says otherwise.
      let alive = !row.dod;
      const deadVal = firstValue(row, ["deceased", "dead"]);
      if (deadVal) alive = !parseBool(deadVal, !alive);
      const aliveVal = firstValue(row, ["alive", "living"]);
      if (aliveVal) alive = parseBool(aliveVal, alive);
      p.alive = alive;

      // Married unless a column says otherwise; defaults to "has a spouse".
      let married = !!firstValue(row, LIST_COLUMNS.spouseIds);
      const marriedVal = firstValue(row, ["married", "wedded"]);
      if (marriedVal) married = parseBool(marriedVal, married);
      p.married = married;

      Object.keys(LOCATION_GROUPS).forEach((grp) => {
        const cols = LOCATION_GROUPS[grp];
        p[grp] = {
          village: row[cols[0]] || "", taluka: row[cols[1]] || "",
          district: row[cols[2]] || "", pincode: row[cols[3]] || "",
        };
      });

      LIST_FIELDS.forEach((k) => { p[k] = splitIds(firstValue(row, LIST_COLUMNS[k])); });
      if (!p.fatherIds.length) p.fatherIds = [DUMMY_FATHER];
      if (!p.motherIds.length) p.motherIds = [DUMMY_MOTHER];

      REQUIRED.forEach((k) => { if (!(p[k] || "").trim()) missingByField[k].push(pid); });
      people[pid] = p;
    }

    // Summarize missing required fields (one line per field).
    const dataRows = Object.keys(people).length - 2;
    REQUIRED.forEach((key) => {
      const misses = missingByField[key];
      if (!misses.length) return;
      if (dataRows && misses.length === dataRows) {
        warnings.push("required '" + key + "' is empty for all " + dataRows + " people.");
      } else {
        const shown = misses.slice(0, 10).join(", ") + (misses.length > 10 ? "…" : "");
        warnings.push("required '" + key + "' missing for " + misses.length + " person(s): " + shown);
      }
    });

    // Validate id references and make spouse links mutual.
    const known = new Set(Object.keys(people));
    Object.values(people).forEach((p) => {
      LIST_FIELDS.forEach((key) => {
        p[key].forEach((ref) => {
          if (!known.has(ref)) warnings.push(p.id + ": " + key + " references unknown id '" + ref + "'.");
        });
      });
      p.spouseIds.forEach((sid) => { if (people[sid]) addUnique(people[sid].spouseIds, p.id); });
    });

    return { data: { version: 1, people }, warnings };
  }

  return { convert, parseCsv };
})();
