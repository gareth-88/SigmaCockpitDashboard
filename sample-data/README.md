# Harborline sample data

Dummy data for the two Harborline Sigma plugins. Every figure is illustrative. The Q3 2026 totals in `cockpit_facts.csv` tie exactly to `metric_values.csv`, so the Spring cockpit and Number check show the same numbers from the same definitions.

## Loading it into Sigma

- **CSV upload:** if your Sigma connection allows uploads, upload each CSV as its own table and add the tables to a workbook.
- **Snowflake:** run `load_harborline_sample.sql` in a database you can write to. It creates the `HB_GOVERNANCE` schema and all seven tables, with `WEEK_START` typed as a date.

Then add a plugin element, select each table as an element and drag its columns into the data wells. Column names match the well names, so `METRIC_ID` goes in the Metric ID well.

## Files, and which plugin reads them

| File | Rows | Spring cockpit | Number check |
| --- | --- | --- | --- |
| `cockpit_facts.csv` | 1,944 | Cockpit facts (required) | Not used |
| `metric_catalogue.csv` | 10 | Metric catalogue (required) | Metric catalogue (required) |
| `metric_lineage.csv` | 88 | Lineage (optional) | Lineage (optional) |
| `metric_checks.csv` | 23 | Check results (optional) | Check results (required) |
| `metric_values.csv` | 13 | Not used | Metric values (required) |
| `metric_signoffs.csv` | 29 | Not used | Sign-off log (optional) |
| `ai_answer_log.csv` | 6 | Not used | AI answer log (optional) |

The catalogue, lineage and checks are shared: both plugins read the same definitions.

## cockpit_facts.csv

One row per week, region, channel and category: 27 weeks from 6 Jul 2026 to the week of 4 Jan 2027, four regions (Front Range, Mountain, Northern Rockies, Desert Southwest), three channels (Stores, Online, Wholesale) and six categories.

| Column | Well | Notes |
| --- | --- | --- |
| week_start | Week start (required) | Monday of the week. Date or text in YYYY-MM-DD both work. |
| period | Period | Q3 2026, Q4 2026, Q1 2027. If the well is empty the plugin derives the quarter from the week. |
| region, channel, category | Region, Channel, Category (required) | The channel named Wholesale is excluded from sell-through, weeks of supply and inventory, as the definitions say. |
| net_revenue | Net revenue (required) | Dollars, after returns and discounts. |
| cogs | Cost of goods (required) | Dollars. |
| units_sold | Units sold (required) | |
| units_received | Units received (required) | Zero for wholesale. |
| units_on_hand | Units on hand (required) | End of week. Zero for wholesale. |
| planned_units_next_8w | Planned units, next 8 weeks (required) | From the approved merchandise plan. |
| inventory_cost | Inventory at cost (required) | End of week, dollars. |

How the cockpit calculates each figure from these columns:

- **Net revenue:** sum of net_revenue for the period.
- **Gross margin:** (net_revenue less cogs) divided by net_revenue, for the period.
- **Sell-through, season to date:** units_sold divided by units_received from the first week to the end of the period, stores and online only.
- **Weeks of supply:** units_on_hand in the last week of the period, divided by planned_units_next_8w divided by 8.
- **Inventory at cost:** inventory_cost in the last week of the period.

## The reference tables

- `metric_catalogue.csv`: one row per metric. metric_id (M01 to M10) is the key the cockpit uses: M01 net revenue, M02 to M04 channel revenue, M05 gross margin, M06 sell-through, M07 weeks of supply, M10 inventory at cost.
- `metric_lineage.csv`: the path for each metric, in step order: source systems, then bronze, silver and gold in Snowflake, then the Sigma data model and the cockpit. Rows with a period apply only to that period (the Q1 2026 as reported replay).
- `metric_checks.csv`: check results. The cockpit uses each metric's latest run; Number check uses the run for the selected period. Results are Pass, Warn or Fail.

## Stories in the data

- Q3 2026 ties out exactly: $44.6M net revenue (stores $26.3M, online $12.9M, wholesale $5.4M), 47.2% gross margin, 61.4% sell-through, 14.2 weeks of supply, $31.8M inventory at cost.
- At the end of Q3, camping carries 41 weeks of supply against the 10 to 14 week band and outerwear only 6. By January every category is above the band after the holidays, and camping is highest at 57 weeks, which matters for the February buy.
- Weeks of supply is provisional: two stores sent late inventory snapshots.
- The Q1 2026 as reported rows replay the board error, which the checks block.

Regenerate everything with `npm run data` (Python 3, no packages needed).
