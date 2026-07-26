"""Build data.json for the LotI2 prose-review UI.

Pairs each canonical-store spell (apps/assay/homebrew/spells/*.json) with the
stakeholder's 5e original (vendor gen_homebrew.json, matched via
flags.assay.seededFrom.originalName) and the friend's intermediate PF2e
conversion (vendor all_spells_pf2e.json, matched via seededFrom.convertedName).

Run from the repo root: python3 apps/assay/review-ui/build_data.py
"""

import glob
import json
import os
import re
from pathlib import Path

ROOT = os.path.dirname(__file__)
STORE = os.path.join(ROOT, "..", "homebrew", "spells")
VENDOR = os.path.join(ROOT, "..", "vendor", "run_balance")

UUID_RE = re.compile(r"@UUID\[[^\]]*?\.([^\].]+)\](?:\{([^}]*)\})?")


def store_html(s):
    return UUID_RE.sub(lambda m: f'<span class="ref">{m.group(2) or m.group(1)}</span>', s)


DECISIONS_PATH = Path(ROOT, "decisions.json")
try:
    decisions = json.loads(DECISIONS_PATH.read_text())
except FileNotFoundError:
    decisions = {}

originals = {
    s["name"]: s
    for s in json.loads(Path(VENDOR, "base_spells_5e", "gen_homebrew.json").read_text())["spell"]
}
all_5e = json.loads(Path(VENDOR, "base_spells_5e", "all_spells_5e.json").read_text())
if isinstance(all_5e, dict):
    all_5e = all_5e.get("spell", [])
fallback_5e = {s["name"]: s for s in all_5e if isinstance(s, dict) and "name" in s}

inter_raw = json.loads(Path(VENDOR, "pf2e_converted_spells", "all_spells_pf2e.json").read_text())
if isinstance(inter_raw, dict):
    inter_raw = inter_raw.get("spell") or inter_raw.get("spells") or []
intermediates = {s["name"]: s for s in inter_raw if isinstance(s, dict) and "name" in s}

spells = []
unmatched_orig, unmatched_inter = [], []
for f in sorted(glob.glob(os.path.join(STORE, "*.json"))):
    doc = json.loads(Path(f).read_text())
    slug = os.path.basename(f)[:-5]
    seeded = doc.get("flags", {}).get("assay", {}).get("seededFrom", {})
    oname = seeded.get("originalName", doc["name"])
    cname = seeded.get("convertedName", doc["name"])
    orig = originals.get(oname) or fallback_5e.get(oname)
    if orig is None:
        unmatched_orig.append((slug, oname))
    inter = intermediates.get(cname) or intermediates.get(doc["name"])
    if inter is None:
        unmatched_inter.append((slug, cname))
    sy = doc["system"]
    sy = json.loads(json.dumps(sy))  # deep copy before mutation
    sy["description"]["value"] = store_html(sy["description"]["value"])
    hei = sy.get("heightening") or {}
    for over in (hei.get("levels") or {}).values():
        if isinstance(over, dict) and isinstance(over.get("description"), dict):
            over["description"]["value"] = store_html(over["description"]["value"])
    if inter is not None:
        inter = json.loads(json.dumps(inter))
        inter.pop("convertedFromSpiritOf", None)
    spells.append(
        {
            "slug": slug,
            "name": doc["name"],
            "seededFrom": {"originalName": oname, "convertedName": cname},
            "store": sy,
            "original": orig,
            "intermediate": inter,
            "decisions": decisions.get(slug, []),
        }
    )

out = os.path.join(ROOT, "data.json")
Path(out).write_text(json.dumps({"spells": spells}))
print(f"wrote {out}: {len(spells)} spells")
print(f"unmatched originals: {unmatched_orig or 'none'}")
print(f"unmatched intermediates: {unmatched_inter or 'none'}")
