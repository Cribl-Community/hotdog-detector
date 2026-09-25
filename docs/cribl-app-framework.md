# Build with the Cribl App Framework

Use **criblio/cribl-search-app-framework** libraries before writing query
transports, charts, settings or Investigators. Browser imports use the
`@criblio/app-utils` subpaths below through the Cribl fetch proxy.

## Scope and discovery

Read the app's AGENTS.md, framework guide, package.json and relevant source.
**An explicit user file list is the complete reading budget**, including
node_modules and shell discovery: do not use ls, grep, sed or other commands to
inspect extra files. The API contracts below support a first implementation
without reading package declarations. Build to get compiler diagnostics, then
repair the code. General advice in templates to inspect declarations does not
expand a user's explicit budget. Read the app-framework skill once; continuation
pages, if present, belong to that same read.

Starter Settings, routes and navigation are optional. Remove excluded features;
a single overview can replace src/App.tsx. Preserve the existing entry point and
style imports; there is no need to discover or rewrite src/main.tsx for that.
Follow an already approved plan without proposing another.

| Need | Authoring tool | Browser library |
| --- | --- | --- |
| Logs, events, traces, KQL | `run_search` | `runQuery` from `/search` |
| Metrics and PromQL | `run_metrics_query` | `queryRange`, `queryInstant` from `/metrics` |
| Charts and result cards | Validate the query first | `LineChart`, `toLineSeries`, `StatTile`, `Panel`, `DataTable` from `/viz` |
| Inventory/configuration or a specific API failure | `cribl_api` | Existing settings helpers or API adapter |
| GoatTown embedding | Read `embed-agent` | `GoatTownClient`, `observeSession` from `/goattown`; `/investigator` transcript |

For logs, sample the requested dataset with bounded read-only KQL, for example
`dataset="my-dataset" | limit 3`, over an explicit time window, then validate the
aggregate. For metrics, use `.catalog <name fragment>` then a small grouped
PromQL query. Use `.labels <metric>` or `.values <label>` only for missing label
information within the user's query budget. A service name may be a label rather
than a metric prefix. Do not inventory unrelated data or repeat supplied labels.
Copy user-supplied metric identifiers exactly; do not add prefixes or rename
them. If discovery contradicts the supplied name, resolve that discrepancy
before implementing the query. Zero matches do not validate an invented name.

A failed transport or query does not prove absence of data or invalid PromQL.
Inspect the actual error and report failed validation honestly. Only successful
zero-row results establish an empty window. Build and lint do not execute queries.

## Dependencies and build

Use app-utils **0.8.9**, agent-protocol **0.4.2**, and app-tooling **0.2.3**.
Version 0.8.9 includes the shared GoatTown client and accepts complete metrics
responses whose advertised event count is lower than the returned samples. Native workspaces need installed npm
dependencies: `build_app` prepares them on the first build, without lifecycle
scripts. Implement, then call `build_app` directly; neither an absent lockfile nor
missing node_modules requires a separate Bash install. Build preparation also
repairs incomplete installs before executing project scripts. Use explicit npm
installation commands only for intentional dependency changes or installation
investigations. Keep the framework's compiler versions and tsconfig checks.
Viz peers are React, `d3-array`, `d3-scale`, `d3-shape`, `d3-time-format`.
Check the selected template's package.json before importing `/viz`: older
templates omit the optional D3 peers. Add missing peers to the manifest before
the first `build_app`; that build installs them together. Keep a compatible
manifest and lockfile unchanged rather than rewriting ranges for an already
installed release. The template determines dependencies, not the runtime image.
Preserve the template's style entry points **and their contents**: the skeleton's
global stylesheet contains the shared `:root` design tokens and base typography.
Append page layout rules or edit them in place; do not replace that foundation
with only page-specific CSS. If replacing the inline foundation intentionally,
start the replacement with `@import '@criblio/app-utils/styles/base.css';`
(which also imports `tokens.css`), then add the page rules. Tokens alone do not
restore the body font and reset. Component CSS is packaged, but depends on those
tokens for heading weights, card borders, padding and backgrounds. Build and
lint passing does not prove the page is styled. Preserve distinct headings,
padded summary cards and responsive spacing while batching edits.
Capra loads theme base, icon and core styles in that order.

Implement one useful slice and call `build_app` promptly. In native workspaces
it runs the project's build script (including TypeScript when configured), then
publishes the preview. Fix returned diagnostics and rebuild. `lint_app` runs the
project lint script. Simulated shells have no Node/npm: use build_app/lint_app.
New scaffolds run `tsc -b && vite build && apps build`, including backend bundles.
Host-enabled backend preview runs onRequest handlers with declared API reads.
No persistence, schedules, external writes or Vite plugins.
Use `npm run package -- --version X.Y.Z` to avoid an implicit version bump.

## Query contracts

```tsx
import { queryRange, queryInstant, type MetricSeries, type MetricSample }
  from '@criblio/app-utils/metrics';
import { LineChart, toLineSeries, StatTile, Panel, DataTable }
  from '@criblio/app-utils/viz';

// promql and dataset come from validated discovery; controller belongs to the
// page effect and is aborted on unmount. Independent queries stay concurrent.
const [trend, current] = await Promise.all([
  queryRange(promql, { earliest: '-1h', latest: 'now', step: 60,
    dataset, signal: controller.signal }),
  queryInstant(promql, { earliest: '-15m', latest: 'now',
    dataset, signal: controller.signal }),
]);
const chart = <LineChart title="Request rate"
  series={toLineSeries(trend, { name: labels => labels.service_name })} />;
```

- `queryRange(query, options)` requires `step` in seconds and returns
  `MetricSeries[]`: `{ labels: Record<string,string>, points: { t:number, v:number }[] }`.
- `queryInstant(query, options?)` returns `MetricSample[]`:
  `{ labels: Record<string,string>, _time:number, _value:number }`.
- Options: `earliest`/`latest` are relative strings or epoch milliseconds;
  `dataset` and `signal` are optional. Preserve the discovered dataset; the
  default is `metrics`, but not every workspace uses that name.
- Returned timestamps are epoch **seconds**. `toLineSeries` converts range
  points into chart milliseconds. Its `name` callback receives the **labels
  record**, not a MetricSeries. Use the exported types through adapters.
- `toLineSeries` options are `name`, `kind`, `sortByValue`, and `maxSeries`.
  It assigns colors automatically; there is no `colors` option. For deliberate
  overrides, map the returned `LineSeries[]` and set each series' `color`.
- Missing values are unknown, not zero. Evaluation time does not prove freshness.

Metrics returns inline results in one GET. Never poll `mq-…` IDs or create Search
jobs for metrics. The library rejects failed query jobs even inside HTTP 200.
Keep loading, empty and error states distinct, and preserve live data in preview.
Reuse validated expressions. PromQL selectors attach to the metric before the
range/function: `sum(rate(requests_total{outcome="error"}[5m]))`; a selector after
`rate(...)` is invalid. Derive related cards, trends and table rows from a grouped
result when it already supplies the needed labels. When deduplicating replicated
scrapes, retain semantic labels before summing (including outcomes).

For KQL, `runQuery` from `/search` owns creation, polling, parsing and cancellation:
`runQuery(kql, '-1h', 'now', 20, signal)` returns event objects. Escape dataset
identifiers with `kqlDatasetId` from `/kql` when constructing KQL.

## React component contracts

| Component | Required props | Useful optional props |
| --- | --- | --- |
| `LineChart` | `title: string`, `series: LineSeries[]` | `subtitle`, `height`, `area`, `yFormat(value)`, `error`, `refreshing`, `emptyMessage`, `onBrush(startMs,endMs)` |
| `StatTile` | `label: string`, `value: ReactNode` | `sub: string`, `loading: boolean` |
| `Panel` | `title: string`, `children: ReactNode` | `subtitle`, `error`, `refreshing`, `empty`, `emptyMessage` |
| `DataTable<Row>` | `rows: Row[]`, `rowKey(row): string`, `columns` | `onRowClick(row)` |

Each DataTable column is `{ key: string, header: string, render(row): ReactNode,
numeric?: boolean }`. LineSeries is `{ name: string, color: string,
data: { t: number, v: number }[] }`; prefer `toLineSeries` to manual conversion.
These components do not accept generic chart-library `dataKey` or `accessor`.
React renders strings as text. Compose units and emphasis as JSX, for example
`value={<>{rate.toFixed(1)} <small>req/s</small></>}`; never put HTML tags inside
interpolated strings or use raw HTML injection to make a summary value render.
Use Capra (`@capra/core`, `@capra/icons`) for additional controls. Extra component or skill reads must fit the user's budget.

## Platform and delivery

Browser calls use the platform fetch proxy with injected auth. Search paths use
`/m/default_search`; the helpers handle this. Declare external hosts in
config/proxies.yml. Never hardcode credentials, cross-read another app's KV store,
or serialize independent requests to work around a preview defect.

For requested settings, use `/settings` helpers with the existing KV layout.
A workspace administrator connects the deployed source app once in **Console →
Preview settings → Use deployed app settings**. Existing and new sessions read
its current KV values automatically; no reinstall or session setup is needed.
Preview changes stay in a durable session overlay and survive builds. Reload
preview to reread values cached by app code; discard local edits to return to
production values. Object, array and scalar settings are all supported.
Keep normal fetch and proxies.yml header injection. External requests use the
deployed app's real services through Cribl's app-scoped proxy, which injects
production credentials without copying them into preview. Both the preview
build and deployed app must declare the destination and path. Proxy credential
keys cannot be read as ordinary preview KV. APM Investigator uses the actual
connected service and its existing history. A missing app binding is setup work,
not a reason to hardcode secrets or replace live requests with mock data.
For durable GoatTown embedding, use `GoatTownClient`, `observeSession`,
`conclusionFromEntries`, and `SessionDiagnostics` from
`@criblio/app-utils/goattown`; use `ProposalPanel` from
`@criblio/app-utils/goattown/proposal-panel`. Read `embed-agent` for receipts,
image input, and human configuration review. Omit settings and
Investigators when outside scope.

For catalog continuation, use nextOffset and the returned contentHash until null.

In native workspaces, `build_app({app, lint:true})` runs build and then lint in
one bounded execution when this option is present in its tool schema. The
preview is published only after both checks pass. Batch related file writes
using `write_file.files` (or exact replacements using `edit_file.files`) when
available. The runtime honors a repository's npm/pnpm selection and lockfile;
never change package managers as an automatic error-recovery step.
