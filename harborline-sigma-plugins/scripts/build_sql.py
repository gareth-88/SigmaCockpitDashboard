"""Writes sample-data/load_harborline_sample.sql from every CSV in sample-data/.
Numbers become NUMBER, week_start becomes DATE, everything else VARCHAR. Illustrative data only."""
import csv, glob, os
HERE = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(HERE, "..", "sample-data")
ORDER = ["metric_catalogue", "metric_values", "metric_checks", "metric_lineage", "metric_signoffs", "ai_answer_log", "cockpit_facts"]
def is_num(v):
    try: float(v); return True
    except ValueError: return False
out = ["-- Harborline Outfitters sample data for the Number check and Spring cockpit Sigma plugins. Illustrative only.",
       "-- Run in a Snowflake database you can write to, then add the HB_GOVERNANCE tables to a Sigma workbook.",
       "CREATE SCHEMA IF NOT EXISTS HB_GOVERNANCE;", "USE SCHEMA HB_GOVERNANCE;", ""]
for name in ORDER:
    rows = list(csv.DictReader(open(os.path.join(D, f"{name}.csv"))))
    cols = list(rows[0].keys())
    types = {}
    for c in cols:
        vals = [r[c] for r in rows if r[c] != ""]
        types[c] = "DATE" if c == "week_start" else "NUMBER(18,4)" if vals and all(is_num(v) for v in vals) else "VARCHAR"
    out.append(f"CREATE OR REPLACE TABLE {name.upper()} (" + ", ".join(f"{c.upper()} {types[c]}" for c in cols) + ");")
    def lit(c, v):
        if v == "": return "NULL"
        if types[c] == "NUMBER(18,4)": return v
        if types[c] == "DATE": return f"'{v}'::DATE"
        return "'" + v.replace("'", "''") + "'"
    for i in range(0, len(rows), 500):
        chunk = rows[i:i + 500]
        out.append(f"INSERT INTO {name.upper()} VALUES\n" + ",\n".join("(" + ", ".join(lit(c, r[c]) for c in cols) + ")" for r in chunk) + ";")
    out.append("")
open(os.path.join(D, "load_harborline_sample.sql"), "w").write("\n".join(out))
print("SQL written for", len(ORDER), "tables")
