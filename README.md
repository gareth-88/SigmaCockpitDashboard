# Harborline Outfitters Sigma plugins

Two Sigma plugins in one Vercel project, styled to the Harborline Outfitters design system (Archivo, spruce, aspen, lake), built for the Envisioning the Future workshop. All data is illustrative.

| Path | Plugin | What it does |
| --- | --- | --- |
| `/` | Number check | Click a number and see whether it can be trusted: status, definition, owner, lineage from bronze to gold, the checks that ran, who signed it and the AI answers that used it. |
| `/cockpit/` | Spring cockpit | Net revenue, gross margin, sell-through, weeks of supply and inventory at cost by period, region, channel and category. Hover or tap any figure for its definition, how it is calculated, its lineage and its checks. |
| `/bench.html` | Test bench | A simulated Sigma workbook around Number check, for testing without Sigma. |

Both plugins read the same metric catalogue, lineage and check tables, so the cockpit and Number check give the same number from the same definition. Clicking a figure in the cockpit sets the selected metric control, which opens it in Number check when both sit on the same workbook page.

## Deploy to Vercel

1. Push this folder to a Git repository (GitHub, GitLab or Bitbucket).
2. In Vercel, import the repository. `vercel.json` sets everything: Vite, `npm run build:vercel`, output `dist`.
3. Deploy. Note the production URL, for example `https://harborline-plugins.vercel.app`.

With the Vercel CLI instead: `npm install`, then `vercel` from this folder.

## Register the plugins in Sigma

An Admin adds each plugin in Sigma's administration settings for plugins, using its production URL (Sigma's guide: https://help.sigmacomputing.com/docs/register-a-plugin-with-your-sigma-organization):

- Number check: `https://<your-project>.vercel.app/`
- Spring cockpit: `https://<your-project>.vercel.app/cockpit/`

Then, in a workbook in Edit mode, add a UI element, choose Plugin and pick the plugin. Turn on **Use Harborline sample data** to see it working before connecting tables.

## Connect the data

Load the tables in `sample-data/` (CSV upload or the Snowflake script, see `sample-data/README.md`) and add them to the workbook. In the plugin's editor panel, select each element and drag its columns into the matching **data wells**. Wells marked required must be filled. An empty well falls back to a column with the same name if Sigma sends one.

**Spring cockpit elements:** Cockpit facts (required), Metric catalogue (required), Lineage (optional), Check results (optional). Optional control: Selected metric, a text control shared with Number check.

**Number check elements:** Metric catalogue, Metric values and Check results (required), Lineage, Sign-off log and AI answer log (optional). Optional controls: Selected metric and Selected period. Optional action: Raise a query, with Show the Raise a query button turned on.

The cockpit reads catalogue metric IDs M01 (net revenue), M02 to M04 (stores, online and wholesale revenue), M05 (gross margin), M06 (sell-through), M07 (weeks of supply) and M10 (inventory at cost). Names and definitions come from the catalogue.

## Develop

- `npm install`, then `npm run dev`. Number check serves on http://localhost:3000, the Sigma Plugin Dev Playground's default URL, and the cockpit on http://localhost:3000/cockpit/. To use the Dev Playground for the cockpit, an Admin registers a development plugin pointing at the cockpit URL.
- `npm run build` builds both plugins to `dist/`. `npm run build:vercel` also adds the test bench.
- `npm run build:cockpit-preview` and `npm run build:preview` write one self-contained HTML file per plugin for sharing outside Sigma. Outside Sigma, or with `#demo` on the URL, both plugins run on the built-in sample data.
- `npm run data` regenerates the sample data and SQL. The generators assert that Q3 2026 ties out across both plugins.

## Lock it to your Sigma domain (recommended)

Once you know the address your Sigma organisation runs on, stop other sites framing the plugins by adding this header to the `"/(.*)"` block in `vercel.json`, changing the domain to yours:

```json
{ "key": "Content-Security-Policy", "value": "frame-ancestors https://app.sigmacomputing.com" }
```

## Notes

- Built on `@sigmacomputing/plugin` 1.3.2, React 18.3.1 and Vite 5.4.10. Archivo loads from Google Fonts with system fallbacks.
- Tested against a stand-in for Sigma that speaks the plugin protocol: data wells, dates sent as epoch milliseconds, controls in both directions, setup screens, light and dark workbook backgrounds. Not yet run inside a live Sigma workbook.
