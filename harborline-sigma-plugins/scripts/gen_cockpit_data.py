"""Harborline spring cockpit: weekly fact table (dummy data).

Grain: week x region x channel x category. 27 weeks from 6 Jul 2026 (season start)
to the week of 4 Jan 2027. Every Q3 2026 total is scaled to tie exactly to the figures
in metric_values.csv, so the cockpit and Number check show the same numbers.

Run: python3 scripts/gen_cockpit_data.py
Writes sample-data/cockpit_facts.csv and src/cockpit/cockpitSample.json.
"""
import csv, json, os, random, datetime as dt

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_CSV = os.path.join(HERE, "..", "sample-data", "cockpit_facts.csv")
OUT_JSON = os.path.join(HERE, "..", "src", "cockpit", "cockpitSample.json")
rng = random.Random(42)

WEEKS = [dt.date(2026, 7, 6) + dt.timedelta(weeks=i) for i in range(27)]
def period_of(d): return f"Q{(d.month - 1) // 3 + 1} {d.year}"
REGIONS = {"Front Range": 0.35, "Mountain": 0.25, "Northern Rockies": 0.20, "Desert Southwest": 0.20}
CHANNELS = ["Stores", "Online", "Wholesale"]
# category: (retail ASP $, cost ratio, Q3 weight, Q4 weight)
CATS = {
    "Outerwear":            (260, 0.50, 0.16, 0.30),
    "Footwear":             (150, 0.53, 0.20, 0.18),
    "Packs and bags":       (120, 0.52, 0.15, 0.12),
    "Camping":              (180, 0.55, 0.24, 0.10),
    "Climbing":             ( 90, 0.50, 0.10, 0.08),
    "Base layers and apparel": ( 70, 0.48, 0.15, 0.22),
}
# Revenue targets by period and channel ($). Q3 ties to metric_values.csv.
TARGET_REV = {
    "Q3 2026": {"Stores": 26_300_000, "Online": 12_900_000, "Wholesale": 5_400_000},
    "Q4 2026": {"Stores": 33_000_000, "Online": 18_600_000, "Wholesale": 5_800_000},
    "Q1 2027": {"Stores": 1_550_000, "Online": 950_000, "Wholesale": 300_000},
}
TARGET_COGS = {"Q3 2026": 23_540_000, "Q4 2026": 31_110_000, "Q1 2027": 1_430_000}
Q3_UNITS_SOLD_RETAIL = 184_050       # stores + online, ties to the units check
Q3_UNITS_RECEIVED_RETAIL = 299_756   # gives 61.4% sell-through at Q3 end
Q3_END_ON_HAND = 298_200             # with planned weekly 21,000 gives 14.2 weeks
Q3_END_WOS = 14.2
Q3_END_INV_COST = 31_800_000

def week_weight(d):
    """Seasonality: steady summer, autumn ramp, holiday peak, January dip."""
    m, day = d.month, d.day
    if m in (7, 8): return 1.0
    if m == 9: return 1.05
    if m == 10: return 1.15
    if m == 11: return 1.45 if day >= 23 else 1.25
    if m == 12: return 1.6 if day <= 21 else 1.1
    return 0.75

def cat_weight(cat, d):
    _, _, q3w, q4w = CATS[cat]
    return q3w if d.month in (7, 8, 9) else q4w

rows = []
for w in WEEKS:
    for r, rs in REGIONS.items():
        for c in CHANNELS:
            for k in CATS:
                base = week_weight(w) * rs * cat_weight(k, w) * rng.uniform(0.9, 1.1)
                rows.append(dict(week_start=w.isoformat(), period=period_of(w), region=r, channel=c, category=k, _w=w, _base=base))

def scale_to(rows_sel, key, target, as_int=True):
    tot = sum(x[key] for x in rows_sel)
    f = target / tot
    for x in rows_sel:
        x[key] = round(x[key] * f) if as_int else x[key] * f
    resid = target - sum(x[key] for x in rows_sel)
    biggest = max(rows_sel, key=lambda x: x[key])
    biggest[key] += resid
    assert sum(x[key] for x in rows_sel) == target

# Revenue
for x in rows: x["net_revenue"] = x["_base"]
for p, chans in TARGET_REV.items():
    for c, t in chans.items():
        scale_to([x for x in rows if x["period"] == p and x["channel"] == c], "net_revenue", t)

# Cost of goods: category cost ratio, higher for wholesale, scaled to the period target
for x in rows:
    ratio = CATS[x["category"]][1] * (1.22 if x["channel"] == "Wholesale" else 1.0) * rng.uniform(0.97, 1.03)
    x["cogs"] = x["net_revenue"] * ratio
for p, t in TARGET_COGS.items():
    scale_to([x for x in rows if x["period"] == p], "cogs", t)

# Units sold: revenue / ASP (wholesale sells at 55% of retail)
for x in rows:
    asp = CATS[x["category"]][0] * (0.55 if x["channel"] == "Wholesale" else 1.0)
    x["units_sold"] = x["net_revenue"] / asp
retail = lambda x: x["channel"] != "Wholesale"
scale_to([x for x in rows if x["period"] == "Q3 2026" and retail(x)], "units_sold", Q3_UNITS_SOLD_RETAIL)
for x in rows:
    if x["period"] != "Q3 2026" or not retail(x): x["units_sold"] = round(x["units_sold"])

# Units received: retail only, front-loaded at season start, holiday top-up in Oct and Nov
def recv_weight(d):
    return {7: 2.2, 8: 1.4, 9: 0.8, 10: 1.3, 11: 1.1, 12: 0.4, 1: 0.2}[d.month]
CAT_RECV = {  # when each category's stock lands: camping early for summer, outerwear late for winter
    "Outerwear": {7: 0.5, 8: 0.9, 9: 1.8}, "Camping": {7: 1.7, 8: 0.9, 9: 0.5},
    "Footwear": {7: 1.0, 8: 1.2, 9: 1.0}, "Packs and bags": {7: 1.2, 8: 1.1, 9: 0.8},
    "Climbing": {7: 0.9, 8: 1.0, 9: 1.1}, "Base layers and apparel": {7: 0.7, 8: 1.0, 9: 1.5},
}
for x in rows:
    cat_f = CAT_RECV[x["category"]].get(x["_w"].month, 1.0)
    x["units_received"] = (recv_weight(x["_w"]) * cat_f * x["units_sold"] * rng.uniform(0.9, 1.1)) if retail(x) else 0
scale_to([x for x in rows if x["period"] == "Q3 2026" and retail(x)], "units_received", Q3_UNITS_RECEIVED_RETAIL)
sold_season_retail = sum(x["units_sold"] for x in rows if retail(x))
later_recv_target = round(sold_season_retail / 0.74) - Q3_UNITS_RECEIVED_RETAIL   # about 74% sell-through by January
scale_to([x for x in rows if x["period"] != "Q3 2026" and retail(x)], "units_received", later_recv_target)
for x in rows:
    if not retail(x): x["units_received"] = 0

# On hand: stock flow per row from an opening position, then one factor so Q3 end hits target
key = lambda x: (x["region"], x["channel"], x["category"])
series = {}
for x in rows: series.setdefault(key(x), []).append(x)
for k, xs in series.items():
    xs.sort(key=lambda x: x["_w"])
    if k[1] == "Wholesale":
        for x in xs: x["units_on_hand"] = 0.0
        continue
    on = sum(x["units_sold"] for x in xs[:8]) * 1.1
    lo = on
    for x in xs:
        on = on + x["units_received"] - x["units_sold"]
        lo = min(lo, on)
        x["units_on_hand"] = on
    lift = max(0, -lo) + 50
    for x in xs: x["units_on_hand"] += lift
q3_end = WEEKS[12]
end_rows = [x for x in rows if x["_w"] == q3_end and retail(x)]
f = Q3_END_ON_HAND / sum(x["units_on_hand"] for x in end_rows)
for x in rows: x["units_on_hand"] = round(x["units_on_hand"] * f)
resid = Q3_END_ON_HAND - sum(x["units_on_hand"] for x in end_rows)
max(end_rows, key=lambda x: x["units_on_hand"])["units_on_hand"] += resid

# Planned units for the next 8 weeks: actual next-8-week retail sales with plan error, spring plan at the end
for k, xs in series.items():
    for i, x in enumerate(xs):
        if k[1] == "Wholesale":
            x["planned_units_next_8w"] = 0; continue
        nxt = xs[i + 1:i + 9]
        level = (sum(n["units_sold"] for n in nxt) / len(nxt)) if nxt else x["units_sold"] * 1.15
        if len(nxt) < 8: level = level * 0.6 + x["units_sold"] * 1.2 * 0.4
        x["planned_units_next_8w"] = level * 8 * rng.uniform(0.97, 1.06)
target_plan = round(Q3_END_ON_HAND * 8 / Q3_END_WOS)
g = target_plan / sum(x["planned_units_next_8w"] for x in end_rows)   # one factor for every week keeps the series smooth
for x in rows: x["planned_units_next_8w"] *= g
scale_to(end_rows, "planned_units_next_8w", target_plan)
for x in rows:
    if not (x["_w"] == q3_end and retail(x)): x["planned_units_next_8w"] = round(x["planned_units_next_8w"])

# Inventory at cost: units on hand x unit cost (ASP x cost ratio), Q3 end ties to the ledger figure
for x in rows:
    unit_cost = CATS[x["category"]][0] * CATS[x["category"]][1]
    x["inventory_cost"] = x["units_on_hand"] * unit_cost * rng.uniform(0.98, 1.02)
g = Q3_END_INV_COST / sum(x["inventory_cost"] for x in end_rows)
for x in rows: x["inventory_cost"] *= g
scale_to(end_rows, "inventory_cost", Q3_END_INV_COST)
for x in rows:
    if not (x["_w"] == q3_end and retail(x)): x["inventory_cost"] = round(x["inventory_cost"])

# ---------------------------------------------------------------- checks against metric_values (Q3, all filters)
q3 = [x for x in rows if x["period"] == "Q3 2026"]
rev = sum(x["net_revenue"] for x in q3); cogs = sum(x["cogs"] for x in q3)
st = sum(x["units_sold"] for x in rows if retail(x) and x["_w"] <= q3_end) / sum(x["units_received"] for x in rows if retail(x) and x["_w"] <= q3_end)
wos = sum(x["units_on_hand"] for x in end_rows) / (sum(x["planned_units_next_8w"] for x in end_rows) / 8)
inv = sum(x["inventory_cost"] for x in end_rows)
assert round(rev / 1e6, 1) == 44.6
assert {c: round(sum(x["net_revenue"] for x in q3 if x["channel"] == c) / 1e6, 1) for c in CHANNELS} == {"Stores": 26.3, "Online": 12.9, "Wholesale": 5.4}
assert round((rev - cogs) / rev * 100, 1) == 47.2, (rev - cogs) / rev
assert round(st * 100, 1) == 61.4, st
assert round(wos, 1) == 14.2, wos
assert round(inv / 1e6, 1) == 31.8
assert min(x["units_on_hand"] for x in rows) >= 0

FIELDS = ["week_start", "period", "region", "channel", "category", "net_revenue", "cogs", "units_sold",
          "units_received", "units_on_hand", "planned_units_next_8w", "inventory_cost"]
out = [{k: x[k] for k in FIELDS} for x in sorted(rows, key=lambda x: (x["week_start"], x["region"], x["channel"], x["category"]))]
for x in out:
    for k in FIELDS[5:]:
        x[k] = int(x[k])
with open(OUT_CSV, "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=FIELDS); w.writeheader(); w.writerows(out)
os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
with open(OUT_JSON, "w") as fh:
    json.dump({"asOf": "12 Jan 2027", "fields": FIELDS, "rows": [[x[k] for k in FIELDS] for x in out]}, fh, separators=(",", ":"))

all_rev = sum(x["net_revenue"] for x in rows)
print(f"{len(out)} rows, {len(WEEKS)} weeks | Q3 ${rev/1e6:.1f}M, margin {(rev-cogs)/rev*100:.1f}%, "
      f"sell-through {st*100:.1f}%, WoS {wos:.1f}, inventory ${inv/1e6:.1f}M | season to date ${all_rev/1e6:.1f}M")
