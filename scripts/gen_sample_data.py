"""Harborline sample data for the Number check plugin.

Every figure here is illustrative sample data built around the workshop
scenario facts (11% Q1 overstatement, wholesale double count across Shopify
and NetSuite, 60 stores, $180M annual revenue, April board and June
restatement). Totals are computed and asserted, never typed.

Run: python3 scripts/gen_sample_data.py
Writes sample-data/*.csv, sample-data/load_harborline_sample.sql and
src/sampleData.json (the plugin's demo mode).
"""
import csv, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_CSV = os.path.join(HERE, "..", "sample-data")
OUT_JSON = os.path.join(HERE, "..", "src", "sampleData.json")

Q3 = "Q3 2026"
Q1 = "Q1 2026 as reported"

# ---------------------------------------------------------------- catalogue
catalogue = [
  dict(metric_id="M01", metric_name="Net revenue, all channels", unit="$M",
       definition="Sales across stores, online and wholesale, after returns and discounts, counted once per order.",
       rule="Wholesale revenue comes from NetSuite invoices only. Wholesale orders placed through Shopify are matched to their invoice and excluded from online revenue.",
       owner_role="Controller", approver_role="CFO", source_of_truth="NetSuite general ledger",
       version="v1.1", approved_on="2027-01-06", ai_allowed="Yes"),
  dict(metric_id="M02", metric_name="Store net revenue", unit="$M",
       definition="Sales rung through the 60 store tills, after returns and discounts.",
       rule="Comes from store point of sale and must tie to the store revenue accounts in NetSuite.",
       owner_role="VP Retail Operations", approver_role="CFO", source_of_truth="Store point of sale",
       version="v1.0", approved_on="2026-12-10", ai_allowed="Yes"),
  dict(metric_id="M03", metric_name="Online (DTC) net revenue", unit="$M",
       definition="Sales placed by consumers on the Shopify store, after refunds and discounts.",
       rule="Excludes wholesale orders placed through Shopify. Those are counted once, in wholesale, from the NetSuite invoice.",
       owner_role="Director of Ecommerce", approver_role="CFO", source_of_truth="Shopify orders, matched to NetSuite",
       version="v1.1", approved_on="2027-01-06", ai_allowed="Yes"),
  dict(metric_id="M04", metric_name="Wholesale net revenue", unit="$M",
       definition="Sales to regional outfitters and resorts, recognised when NetSuite posts the invoice.",
       rule="NetSuite invoices are the only source. Shopify wholesale orders are used to match, never to count.",
       owner_role="Wholesale Sales Director", approver_role="CFO", source_of_truth="NetSuite invoices",
       version="v1.0", approved_on="2026-12-10", ai_allowed="Yes"),
  dict(metric_id="M05", metric_name="Gross margin", unit="%",
       definition="Net revenue less cost of goods sold, as a share of net revenue.",
       rule="Cost of goods comes from the NetSuite general ledger and uses the same order matching as net revenue.",
       owner_role="Controller", approver_role="CFO", source_of_truth="NetSuite general ledger",
       version="v1.0", approved_on="2026-12-10", ai_allowed="Yes"),
  dict(metric_id="M06", metric_name="Sell-through, season to date", unit="%",
       definition="Units sold as a share of units received for the current season, by category, region and channel.",
       rule="Units received come from NetSuite item receipts. Units sold come from store point of sale and Shopify, excluding wholesale.",
       owner_role="VP Merchandising", approver_role="CGO", source_of_truth="Point of sale, Shopify and NetSuite receipts",
       version="v1.0", approved_on="2026-12-10", ai_allowed="Yes"),
  dict(metric_id="M07", metric_name="Weeks of supply", unit="weeks",
       definition="Units on hand divided by the average weekly units planned to sell over the next eight weeks.",
       rule="Uses the approved merchandise plan. A store missing its nightly inventory snapshot makes the number provisional.",
       owner_role="Director of Inventory Planning", approver_role="CGO", source_of_truth="Store inventory snapshots and NetSuite",
       version="v1.0", approved_on="2026-12-10", ai_allowed="Yes"),
  dict(metric_id="M08", metric_name="Online return rate", unit="%",
       definition="Refunded online sales as a share of gross online sales, by order month.",
       rule="Refunds come from Shopify and must tie to the refund accounts in NetSuite.",
       owner_role="Director of Ecommerce", approver_role="CFO", source_of_truth="Shopify refunds",
       version="v1.0", approved_on="2026-12-10", ai_allowed="Yes"),
  dict(metric_id="M09", metric_name="Active customers, last 12 months", unit="customers",
       definition="Distinct people or businesses with at least one paid order in any channel in the last 12 months.",
       rule="Draft: one customer per matched identity across Shopify, NetSuite and Salesforce. Awaiting CFO approval.",
       owner_role="CGO", approver_role="CFO", source_of_truth="Customer match across Shopify, NetSuite and Salesforce",
       version="v0.9 draft", approved_on="", ai_allowed="Provisional only"),
  dict(metric_id="M10", metric_name="Inventory on hand at cost", unit="$M",
       definition="Units on hand in stores, warehouse and in transit, valued at cost.",
       rule="Must tie to the inventory accounts in the NetSuite general ledger.",
       owner_role="Controller", approver_role="CFO", source_of_truth="NetSuite general ledger",
       version="v1.0", approved_on="2026-12-10", ai_allowed="Yes"),
]
CAT = {m["metric_id"]: m for m in catalogue}

# ---------------------------------------------------------------- values
q3 = dict(stores=26.3, dtc=12.9, wholesale=5.4)
q3_total = round(sum(q3.values()), 2)
assert q3_total == 44.6

# Q1: certified truth vs what was assembled by hand for the board
q1_true = dict(stores=22.5, dtc=10.4, wholesale=5.1)
q1_true_total = round(sum(q1_true.values()), 2)
q1_dup_wholesale_in_shopify = 4.18                                      # wholesale orders Shopify captured
q1_reported_dtc = round(q1_true["dtc"] + q1_dup_wholesale_in_shopify, 2)  # Shopify pull
q1_reported_stores = round(q1_true["stores"] + q1_true["wholesale"], 2)   # NetSuite pull, labelled stores
q1_reported_total = round(q1_reported_dtc + q1_reported_stores, 2)
overstatement = (q1_reported_total - q1_true_total) / q1_true_total
assert q1_true_total == 38.0 and q1_reported_total == 42.18
assert round(overstatement * 100) == 11, overstatement                  # scenario fact: 11%

values = [
  ("M01", Q3, q3_total), ("M02", Q3, q3["stores"]), ("M03", Q3, q3["dtc"]),
  ("M04", Q3, q3["wholesale"]), ("M05", Q3, 47.2), ("M06", Q3, 61.4),
  ("M07", Q3, 14.2), ("M08", Q3, 9.8), ("M09", Q3, 412600), ("M10", Q3, 31.8),
  ("M01", Q1, q1_reported_total), ("M02", Q1, q1_reported_stores), ("M03", Q1, q1_reported_dtc),
]
values = [dict(metric_id=m, period=p, value=v, unit=CAT[m]["unit"]) for m, p, v in values]

# ---------------------------------------------------------------- checks
def pct(expected, actual):
    return round((actual - expected) / expected * 100, 2)

checks = []
def chk(m, period, name, what, expected, actual, unit, tol=None, result=None, note="", var=None):
    if var is None and tol is not None and expected:
        var = pct(expected, actual)
    if result is None:
        result = "Pass" if (var is not None and abs(var) <= tol) else "Fail"
    checks.append(dict(metric_id=m, period=period, check_name=name, what_it_checks=what,
                       expected=expected, actual=actual, unit=unit,
                       variance_pct="" if var is None else var,
                       tolerance_pct="" if tol is None else tol,
                       result=result, note=note,
                       run_at="2027-01-12 06:10" if period == Q3 else "Replayed 2027-01-08"))

# Q3, net revenue
chk("M01", Q3, "Channels add up to the total", "Stores plus online plus wholesale equals net revenue.",
    q3_total, round(q3["stores"] + q3["dtc"] + q3["wholesale"], 2), "$M", tol=0.0)
chk("M01", Q3, "Ties to the general ledger", "Net revenue agrees with the revenue accounts in NetSuite.",
    44.63, q3_total, "$M", tol=0.5)
chk("M01", Q3, "No order counted in two systems", "Wholesale orders placed through Shopify are matched to their NetSuite invoice and counted once.",
    0, 0, "$M", result="Pass", note="1,184 wholesale orders placed online were matched and counted in wholesale only.")
# Q3, stores
chk("M02", Q3, "Ties to store point of sale", "Store revenue agrees with the till totals from all stores.",
    26.31, q3["stores"], "$M", tol=0.5)
chk("M02", Q3, "Every store reported", "All 60 stores loaded their nightly sales.", 60, 60, "stores", result="Pass")
# Q3, online
chk("M03", Q3, "No order counted in two systems", "Wholesale orders placed through Shopify are excluded from online revenue.",
    0, 0, "$M", result="Pass", note="1,184 wholesale orders placed online were moved to wholesale.")
chk("M03", Q3, "Ties to Shopify payouts", "Online revenue agrees with Shopify payouts for consumer orders.",
    12.93, q3["dtc"], "$M", tol=1.0)
# Q3, wholesale
chk("M04", Q3, "Comes from NetSuite invoices only", "Wholesale revenue equals posted NetSuite invoices.",
    q3["wholesale"], q3["wholesale"], "$M", tol=0.0)
chk("M04", Q3, "Online wholesale orders matched", "Every wholesale order placed through Shopify has a matching invoice.",
    1184, 1184, "orders", result="Pass")
# Q3, margin
chk("M05", Q3, "Cost of goods ties to the ledger", "Cost of goods agrees with the NetSuite cost accounts.",
    23.57, 23.54, "$M", tol=0.5)
chk("M05", Q3, "Within 3 points of last year", "Margin is within 3 points of the same quarter last year, or explained.",
    46.5, 47.2, "%", result="Pass", note="Up 0.7 points on Q3 2025.")
# Q3, sell-through
chk("M06", Q3, "Units tie to the inventory ledger", "Units sold and received agree with NetSuite inventory movements.",
    184200, 184050, "units", tol=0.5)
chk("M06", Q3, "Every store reported", "All 60 stores loaded their nightly sales.", 60, 60, "stores", result="Pass")
# Q3, weeks of supply (warning)
chk("M07", Q3, "Every store reported inventory", "All 60 stores loaded their nightly inventory snapshot.",
    60, 58, "stores", result="Warn", note="Two stores sent late snapshots. Their previous-day figures are used until the next load.")
chk("M07", Q3, "Uses the approved merchandise plan", "Forward weekly sales come from the plan version the CGO approved.",
    1, 1, "match", result="Pass")
# Q3, return rate
chk("M08", Q3, "Refunds tie to the ledger", "Shopify refunds agree with the NetSuite refund accounts.",
    1.41, 1.40, "$M", tol=1.0)
# Q3, active customers (warning)
chk("M09", Q3, "Customers matched across systems", "Share of customer records matched across Shopify, NetSuite and Salesforce, target 95%.",
    95.0, 94.1, "%", result="Warn", note="Below target. 5.9% of records still need a match rule.")
# Q3, inventory at cost
chk("M10", Q3, "Ties to the general ledger", "Inventory at cost agrees with the NetSuite inventory accounts.",
    31.84, 31.8, "$M", tol=0.5)

# Q1 replay: the board figure
chk("M01", Q1, "Channels add up to the total", "Stores plus online plus wholesale equals net revenue.",
    q1_reported_total, round(q1_reported_stores + q1_reported_dtc, 2), "$M", tol=0.0,
    note="The figure added up. Arithmetic checks alone could not catch this error.")
chk("M01", Q1, "Ties to the general ledger", "Net revenue agrees with the revenue accounts in NetSuite.",
    q1_true_total, q1_reported_total, "$M", tol=0.5)
chk("M01", Q1, "No order counted in two systems", "Wholesale orders placed through Shopify are matched to their NetSuite invoice and counted once.",
    0, q1_dup_wholesale_in_shopify, "$M", result="Fail",
    note="1,026 wholesale orders were counted in Shopify and again in NetSuite.")
chk("M02", Q1, "Ties to store point of sale", "Store revenue agrees with the till totals from all stores.",
    q1_true["stores"], q1_reported_stores, "$M", tol=0.5,
    note="The NetSuite pull labelled as store revenue also held wholesale invoices.")
chk("M03", Q1, "No order counted in two systems", "Wholesale orders placed through Shopify are excluded from online revenue.",
    0, q1_dup_wholesale_in_shopify, "$M", result="Fail",
    note="Online revenue included 1,026 wholesale orders.")

for c in checks:
    if c["tolerance_pct"] != "" and c["variance_pct"] != "":
        assert (c["result"] == "Pass") == (abs(c["variance_pct"]) <= c["tolerance_pct"]), c

replay_gl = [c for c in checks if c["period"] == Q1 and c["check_name"] == "Ties to the general ledger"][0]
assert round(replay_gl["variance_pct"]) == 11 and replay_gl["result"] == "Fail"

# ---------------------------------------------------------------- lineage
lineage = []
def path(m, steps, period=""):
    for i, (layer, system, obj, what) in enumerate(steps, 1):
        lineage.append(dict(metric_id=m, period=period, step=i, layer=layer, system=system,
                            object_name=obj, what_happens=what))

def certified(m, sources, staging, model):
    # Medallion path: sources -> bronze (raw) -> silver (cleaned, matched) -> gold (certified) -> Sigma
    steps = [("Source", s, o, w) for s, o, w in sources]
    steps.append(("Bronze", "Snowflake", "HB_BRONZE", "Raw copies of each source, landed unchanged with full history."))
    if staging:
        steps.append(("Silver", "Snowflake", staging[0], staging[1]))
    else:
        steps.append(("Silver", "Snowflake", "HB_SILVER.CONFORMED", "Cleaned and conformed: stores, products and fiscal calendar aligned across systems."))
    steps.append(("Gold", "Snowflake", model, f"Definition {CAT[m]['version']} applied and checks run before anything is shown."))
    steps.append(("Sigma", "Sigma", "Harborline certified metrics", "Defined once in the Sigma data model and reused by every workbook."))
    steps.append(("Sigma", "Sigma", "Spring cockpit", "Shown on the cockpit with this check one click away."))
    path(m, steps)

SHOP = ("Shopify", "Orders and refunds", "Online orders, refunds and wholesale orders placed online, loaded daily.")
NS_INV = ("NetSuite", "Invoices and ledger", "Posted invoices and the general ledger, loaded daily.")
POS = ("Store point of sale", "Till sales", "Sales from all 60 stores, loaded nightly.")
MATCH = ("HB_SILVER.ORDERS_MATCHED", "Orders matched across Shopify and NetSuite by order number, so each sale is counted once.")

certified("M01", [SHOP, NS_INV, POS], MATCH, "HB_GOLD.NET_REVENUE")
certified("M02", [POS, NS_INV], None, "HB_GOLD.STORE_REVENUE")
certified("M03", [SHOP, NS_INV], MATCH, "HB_GOLD.ONLINE_REVENUE")
certified("M04", [NS_INV, SHOP], MATCH, "HB_GOLD.WHOLESALE_REVENUE")
certified("M05", [NS_INV, POS, SHOP], MATCH, "HB_GOLD.GROSS_MARGIN")
certified("M06", [POS, SHOP, ("NetSuite", "Item receipts", "Units received into stores and the warehouse, loaded daily.")],
          None, "HB_GOLD.SELL_THROUGH")
certified("M07", [("Store point of sale", "Inventory snapshots", "Units on hand per store, loaded nightly."),
                  ("NetSuite", "Inventory and plan", "Warehouse stock, in-transit units and the approved merchandise plan.")],
          None, "HB_GOLD.INVENTORY_POSITION")
certified("M08", [SHOP, NS_INV], None, "HB_GOLD.ONLINE_RETURNS")
certified("M09", [("Shopify", "Customers", "Online customer accounts and guest checkouts."),
                  ("NetSuite", "Customers", "Billing customers, including wholesale accounts."),
                  ("Salesforce", "Accounts", "Wholesale and resort accounts.")],
          ("HB_SILVER.CUSTOMER_MATCH", "Customer records matched into one identity per person or business."),
          "HB_GOLD.ACTIVE_CUSTOMER")
certified("M10", [("NetSuite", "Inventory and ledger", "Inventory valuation and the general ledger, loaded daily.")],
          None, "HB_GOLD.INVENTORY_VALUE")

as_reported = [
  ("Source", "Shopify", "Manual export", "Revenue exported by hand. Wholesale orders placed online were included."),
  ("Source", "NetSuite", "Manual export", "Revenue exported by hand. Wholesale invoices were included."),
  ("Spreadsheet", "Excel", "Analyst workbook", "Exports combined by hand, with no written definition and no checks."),
  ("AI", "AI assistant", "AI-assisted summary", "Summarised the workbook as asked, with no way to show the working."),
  ("Board", "Board pack", "Q1 board pack", "Sent to the board in April 2026. A director caught the error in the room."),
]
for m in ("M01", "M02", "M03"):
    path(m, as_reported, Q1)

# ---------------------------------------------------------------- sign-offs
signoffs = []
def so(m, period, action, by_role, at, note=""):
    signoffs.append(dict(metric_id=m, period=period, action=action, by_role=by_role, at=at, note=note))

for m in catalogue:
    mid = m["metric_id"]
    if m["approved_on"]:
        so(mid, "", f"Definition {m['version']} approved", m["approver_role"], m["approved_on"])
    else:
        so(mid, "", f"Definition {m['version']} submitted for approval", m["owner_role"], "2026-12-18",
           "Waiting on the CFO. Shown as provisional until approved.")
for mid in ["M01", "M02", "M03", "M04", "M05", "M06", "M08", "M10"]:
    so(mid, Q3, "Quarter certified by owner", CAT[mid]["owner_role"], "2027-01-06")
    so(mid, Q3, "Quarter signed", CAT[mid]["approver_role"], "2027-01-08")
so("M07", Q3, "Quarter certified by owner, with an exception", "Director of Inventory Planning", "2027-01-06",
   "Two stores sent late inventory snapshots.")
so("M01", Q1, "Sent to the board without checks", "Analyst", "2026-04", "Overstated by 11%.")
so("M01", Q1, "Restated to the board", "CFO", "2026-06")

# ---------------------------------------------------------------- AI answers
answers = [
  dict(metric_id="M01", period=Q3, asked_at="2027-01-12 08:40", asked_by_role="CGO",
       question="How did Q3 revenue split by channel?",
       answer=f"${q3_total}M: stores ${q3['stores']}M, online ${q3['dtc']}M, wholesale ${q3['wholesale']}M.",
       query_summary="Net revenue v1.1, by channel, Q3 2026, all regions", scope="Certified"),
  dict(metric_id="M03", period=Q3, asked_at="2027-01-12 09:15", asked_by_role="Regional director, Mountain",
       question="What was online revenue in Q3, without wholesale orders placed online?",
       answer=f"${q3['dtc']}M. The 1,184 wholesale orders placed through Shopify are counted in wholesale, from their NetSuite invoices.",
       query_summary="Online (DTC) net revenue v1.1, Q3 2026, all regions", scope="Certified"),
  dict(metric_id="M06", period=Q3, asked_at="2027-01-12 09:32", asked_by_role="VP Merchandising",
       question="Which category had the best sell-through in the Mountain region?",
       answer="Insulated outerwear, at 68.3% season to date.",
       query_summary="Sell-through v1.0, by category, Mountain region, season to date", scope="Certified"),
  dict(metric_id="M07", period=Q3, asked_at="2027-01-12 10:05", asked_by_role="Planner, footwear",
       question="How many weeks of supply do we have in footwear?",
       answer="11.6 weeks. Provisional: two stores sent late inventory snapshots.",
       query_summary="Weeks of supply v1.0, footwear, all stores", scope="Provisional"),
  dict(metric_id="M09", period=Q3, asked_at="2027-01-12 10:20", asked_by_role="Marketing manager",
       question="How many active customers did we have last quarter?",
       answer="412,600 under the draft definition. Not for distribution until the CFO approves it.",
       query_summary="Active customers v0.9 draft, last 12 months", scope="Provisional"),
  dict(metric_id="M01", period=Q1, asked_at="2026-04", asked_by_role="Analyst",
       question="Summarise Q1 revenue by channel for the board.",
       answer=f"${round(q1_reported_total, 1)}M: stores ${q1_reported_stores}M, online ${round(q1_reported_dtc, 1)}M.",
       query_summary="No certified metric. Two uploaded exports.", scope="Outside certified scope"),
]

# ---------------------------------------------------------------- write
tables = dict(metric_catalogue=catalogue, metric_values=values, metric_checks=checks,
              metric_lineage=lineage, metric_signoffs=signoffs, ai_answer_log=answers)
os.makedirs(OUT_CSV, exist_ok=True)
for name, rows in tables.items():
    with open(os.path.join(OUT_CSV, f"{name}.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

with open(OUT_JSON, "w") as f:
    json.dump(dict(asOf="12 Jan 2027", periods=[Q3, Q1], **tables), f, indent=1)
print({k: len(v) for k, v in tables.items()})
print("Q1 overstatement", round(overstatement * 100, 2), "% | Q3 total", q3_total)
