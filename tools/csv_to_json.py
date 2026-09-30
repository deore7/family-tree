#!/usr/bin/env python3
"""
Convert a hand-filled family CSV into the data/family.json file the app loads.

USAGE
    python tools/csv_to_json.py                         # data/family_template.csv -> data/family.json
    python tools/csv_to_json.py my.csv                  # my.csv -> data/family.json
    python tools/csv_to_json.py my.csv out/family.json  # explicit output path

CSV COLUMNS (header row, in any order; extra columns are ignored)
    member_id   A unique whole number for each person (1, 2, 3, ...). Other rows
                reference it in father_id / mother_id / spouse_id.
    firstName   * required
    lastName    * required
    gender      male/female/other, or the short forms M/F/O (blank -> other)
    father_id   member_id(s) of the father, separated by ";". Leave BLANK for a
                top-level person — they are attached to the default ancestor.
    mother_id   member_id(s) of the mother, separated by ";". Leave BLANK for a
                top-level person.
    spouse_id   zero or more member_ids of spouses, separated by ";"  (links are
                made mutual automatically)
    alive       yes/no (or true/false) — is the person living? Defaults to yes,
                unless a date of death is given or a `deceased` column says so.
    married     yes/no — defaults to yes when a spouse_id is given, else no.
    dob         date of birth, YYYY-MM-DD  (optional)
    dod         date of death, YYYY-MM-DD  (optional; implies alive = no)
    village     * required   (native place)
    taluka      * required
    district    * required
    pincode     6-digit Indian pincode  (optional)
    phone       (optional)
    photo       path in repo (e.g. photos/amit.jpg) or an image URL  (optional)
    current_village / current_taluka / current_district / current_pincode  (optional)
                where the person currently lives
    maher_village / maher_taluka / maher_district / maher_pincode   (optional)
                the person's maher (parental home) location
    sasar_village / sasar_taluka / sasar_district / sasar_pincode   (optional)
                the person's sasar (in-laws' home) location

The two default ancestors ("dummy-father" / "dummy-mother") are always added and
marked unchangeable, so top-level people can point their parents at them.

Rows that are completely empty are skipped. Warnings (missing required fields,
unknown id references) are printed but do NOT stop the file from being written.
"""
import csv
import json
import os
import sys

DUMMY_FATHER = "dummy-father"
DUMMY_MOTHER = "dummy-mother"
LIST_FIELDS = ("fatherIds", "motherIds", "spouseIds")
REQUIRED = ("firstName", "lastName", "village", "taluka", "district")

# Accepted gender spellings -> the canonical value the app stores.
GENDER_MAP = {
    "m": "male", "male": "male",
    "f": "female", "female": "female",
    "o": "other", "other": "other",
}

# CSV column name(s) that feed each person id-list field (first match wins;
# older column names are still accepted for backward compatibility).
LIST_COLUMNS = {
    "fatherIds": ("father_id", "fatherIds"),
    "motherIds": ("mother_id", "motherIds"),
    "spouseIds": ("spouse_id", "spouseIds"),
}
ID_COLUMNS = ("member_id", "id")

# Extra location groups (native place lives in the flat village/... columns).
# maher = parental home, sasar = in-laws' home. All optional.
LOCATION_GROUPS = {
    "current": ("current_village", "current_taluka", "current_district", "current_pincode"),
    "maher": ("maher_village", "maher_taluka", "maher_district", "maher_pincode"),
    "sasar": ("sasar_village", "sasar_taluka", "sasar_district", "sasar_pincode"),
}
TRUE_WORDS = ("true", "yes", "y", "1", "alive", "living")
FALSE_WORDS = ("false", "no", "n", "0", "dead", "deceased")


def first_value(row, names):
    """Return the first non-empty value among the given column names."""
    for n in names:
        if row.get(n):
            return row[n]
    return ""


def split_ids(value):
    """Split a ';' (or ',') separated id list into a clean list."""
    if not value:
        return []
    return [x.strip() for x in value.replace(",", ";").split(";") if x.strip()]


def parse_bool(value, default):
    """Interpret a yes/no-ish string; fall back to `default` if unrecognised."""
    v = (value or "").strip().lower()
    if v in TRUE_WORDS:
        return True
    if v in FALSE_WORDS:
        return False
    return default


def blank_location():
    return {"village": "", "taluka": "", "district": "", "pincode": ""}


def blank_person(pid):
    return {
        "id": pid, "firstName": "", "lastName": "", "gender": "other",
        "alive": True, "married": False,
        "spouseIds": [], "fatherIds": [], "motherIds": [],
        "dob": "", "dod": "", "photo": "",
        "village": "", "taluka": "", "district": "", "pincode": "", "phone": "",
        "current": blank_location(), "maher": blank_location(), "sasar": blank_location(),
    }


def dummy(pid, first, last, gender, spouse):
    p = blank_person(pid)
    p.update(firstName=first, lastName=last, gender=gender, spouseIds=[spouse], isDefault=True)
    return p


def add_unique(lst, value):
    if value and value not in lst:
        lst.append(value)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here)
    in_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "data", "family_template.csv")
    out_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(root, "data", "family.json")

    if not os.path.exists(in_path):
        sys.exit("CSV not found: " + in_path)

    people = {
        DUMMY_FATHER: dummy(DUMMY_FATHER, "Ancestor", "(Father)", "male", DUMMY_MOTHER),
        DUMMY_MOTHER: dummy(DUMMY_MOTHER, "Ancestor", "(Mother)", "female", DUMMY_FATHER),
    }
    warnings = []
    missing_by_field = {k: [] for k in REQUIRED}  # required field -> [ids missing it]

    with open(in_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for lineno, row in enumerate(reader, start=2):  # row 1 is the header
            row = {(k or "").strip(): (v or "").strip() for k, v in row.items()}
            if not any(row.values()):
                continue  # blank line

            pid = first_value(row, ID_COLUMNS) or ("row-" + str(lineno))
            if not pid.isdigit():
                warnings.append("row %d: member_id '%s' is not a whole number." % (lineno, pid))
            if pid in (DUMMY_FATHER, DUMMY_MOTHER):
                warnings.append("row %d: id '%s' is reserved; skipped." % (lineno, pid))
                continue
            if pid in people:
                warnings.append("row %d: duplicate id '%s'; skipped." % (lineno, pid))
                continue

            p = blank_person(pid)
            for key in ("firstName", "lastName", "dob", "dod", "village",
                        "taluka", "district", "pincode", "phone", "photo"):
                if key in row:
                    p[key] = row[key]

            gender_raw = (row.get("gender") or "").strip().lower()
            if not gender_raw:
                gender = "other"  # blank is allowed (data not yet known)
            elif gender_raw in GENDER_MAP:
                gender = GENDER_MAP[gender_raw]
            else:
                warnings.append("row %d: unknown gender '%s'; using 'other'." % (lineno, gender_raw))
                gender = "other"
            p["gender"] = gender

            # Living unless a date of death is given or a column says otherwise.
            alive = not row.get("dod")
            dead_val = first_value(row, ("deceased", "dead"))
            if dead_val:
                alive = not parse_bool(dead_val, not alive)
            alive_val = first_value(row, ("alive", "living"))
            if alive_val:
                alive = parse_bool(alive_val, alive)
            p["alive"] = alive

            # Married unless a column says otherwise; defaults to "has a spouse".
            married = bool(first_value(row, LIST_COLUMNS["spouseIds"]))
            married_val = first_value(row, ("married", "wedded"))
            if married_val:
                married = parse_bool(married_val, married)
            p["married"] = married

            # Optional maher / sasar location groups.
            for grp, cols in LOCATION_GROUPS.items():
                p[grp] = {
                    "village": row.get(cols[0], ""),
                    "taluka": row.get(cols[1], ""),
                    "district": row.get(cols[2], ""),
                    "pincode": row.get(cols[3], ""),
                }

            for key in LIST_FIELDS:
                p[key] = split_ids(first_value(row, LIST_COLUMNS[key]))
            # Blank parents = a top-level person: attach to the default ancestors.
            if not p["fatherIds"]:
                p["fatherIds"] = [DUMMY_FATHER]
            if not p["motherIds"]:
                p["motherIds"] = [DUMMY_MOTHER]

            for key in REQUIRED:
                if not p[key].strip():
                    missing_by_field[key].append(pid)

            people[pid] = p

    # Summarize missing required fields (one line per field instead of one per
    # row) so a column that is simply empty everywhere doesn't drown the output.
    data_rows = len(people) - 2  # exclude the two default ancestors
    for key in REQUIRED:
        misses = missing_by_field[key]
        if not misses:
            continue
        if data_rows and len(misses) == data_rows:
            warnings.append("required '%s' is empty for all %d people (add it later in the app)." % (key, data_rows))
        else:
            shown = ", ".join(misses[:10]) + ("…" if len(misses) > 10 else "")
            warnings.append("required '%s' missing for %d person(s): %s" % (key, len(misses), shown))

    # Validate id references and make spouse links mutual.
    known = set(people)
    for pid, p in list(people.items()):
        for key in LIST_FIELDS:
            for ref in p[key]:
                if ref not in known:
                    warnings.append("%s: %s references unknown id '%s'." % (pid, key, ref))
        for sid in p["spouseIds"]:
            if sid in people:
                add_unique(people[sid]["spouseIds"], pid)

    data = {"version": 1, "people": people}
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(json.dumps(data, indent=2, ensure_ascii=False) + "\n")

    print("Wrote %d people (incl. 2 default ancestors) to %s"
          % (len(people), out_path))
    if warnings:
        print("\n%d warning(s):" % len(warnings))
        for w in warnings:
            print("  - " + w)


if __name__ == "__main__":
    main()
