# Hot Dog or Not Hot Dog

A Cribl app that classifies a photo as **Hot dog**, **Not hot dog** or **Couldn't tell** —
*Silicon Valley*'s very serious food question, answered by a GoatTown vision agent.

You pick a photo, the app sends it to a GoatTown agent inside an investigation session,
polls that session, and turns the agent's answer into a verdict card with the photo
thumbnail, a one-line reason, and the raw agent payload for debugging.

## How it works

```
photo ──► downscale to JPEG (canvas, within the protocol's ceilings)
      ──► GET  /protocol                              capability + image limits
      ──► GET  /investigations/<id>/workspace/llm     vision preflight (effective.vision)
      ──► POST /investigations                        create the session
      ──► POST /investigations/<id>/messages          image as a data URL
      ──► GET  /investigations/<id>/status?eventsSince=N   poll, one request in flight
      ──► fold {seq, ev} frames through applyLoopEvent
      ──► read the conclusion, parse the first line  ──► verdict card + KV history
```

- **Never guesses.** If the agent's model cannot see images the app stops and says so
  instead of sending the photo as text. If nothing parses as a verdict it says
  *Couldn't tell* and shows the raw answer — it never infers from the filename or prompt.
- **Reads the contract, not field-name heuristics.** The service already emits framework
  `LoopEvent`s (`assistantText`, `assistantDone`, `toolCall`, `toolResult`); the app
  flattens the envelope, normalises the two tool shapes, and passes the rest through.
  An agent that concludes with a `report` tool result is read with the framework's own
  `conclusionFromEntries` / `reportToSummary`, because the verdict lives in the tool
  *result*, not in assistant prose.
- **Soft statuses stay soft.** `idle` and `waiting` do not mean the answer arrived; the
  observer keeps polling until the events stop, with a hard timeout that reports honestly.

## Setup

1. **Token.** The GoatTown bearer lives in app KV under `goattownEmbedToken` — never in the
   bundle. Open **Settings** in the app, paste the token into the masked field and save.
   The proxy injects `Authorization: 'Bearer ' + kv.goattownEmbedToken` on every request.
2. **Hosts.** `config/proxies.yml` declares the GoatTown endpoints
   (`goattown.lab.cribl.io`, staging `44-225-69-19.sslip.io`) and allowlists
   `/protocol`, `/agents`, `/investigations`, `/configurations`.
3. **Agent (first run).** `goattown.config.yaml` is compiled into
   `src/goattown/configuration.generated.ts` by the `prebuild` script, staged with
   `POST /configurations?action=validate|store` (raw YAML, *no* `producer` field — the app
   credential assigns it), and a human approves it on GoatTown's Configurations page via
   the returned `reviewPath`. Until the staged revision is the configuration's active
   revision the app shows a setup card; after that it never asks again.

## Development

```bash
npm install
npm run dev        # Vite dev server
npm test           # Vitest  (wire folding, verdict parsing, observer, KV keys)
npm run lint       # ESLint, --max-warnings=0
npm run verify     # lint + tests + tsc -b
npm run build      # tsc -b && vite build && apps build
npm run package -- --version X.Y.Z
```

Deployment from GoatTown is approval-gated; the pack reports its version, and the installed
app can be inspected with `GET /api/v1/apps/hotdog-detector`.

## Layout

| Path | What lives there |
| --- | --- |
| `src/App.tsx` | the whole UI: classifier, session history, Settings |
| `src/goattown/transport.ts` | base URL + bearer handling, raw-response capture for the debug disclosure |
| `src/goattown/session.ts`, `preflight.ts` | create a session, send the photo, vision preflight |
| `src/goattown/wire.ts`, `observer.ts` | flatten `{seq, ev}` frames, fold through `applyLoopEvent`, poll |
| `src/goattown/verdict.ts` | conclusion extraction and first-line verdict parsing |
| `src/goattown/history.ts` | app KV: connection settings, setup state, recent verdicts |
| `src/goattown/image.ts` | downscale to JPEG inside the protocol's limits |
| `src/goattown/provisioning.ts`, `useAgentSetup.ts` | compile → stage → confirm the agent config |
| `goattown.config.yaml` | the agent (`hot-dog-classifier`) that answers `HOT DOG` / `NOT HOT DOG` / `UNCLEAR` |

## Gotchas worth keeping

- **KV keys must be one route-safe segment** (`[A-Za-z0-9_-]`). A key containing `~`, `|`,
  `/` or `%` falls out of the API router, which answers with an HTML 404: reads look like a
  missing key, writes fail as `KV write failed (404)`. Member ids are not restricted (Google
  ids contain `|`), so `keySegment()` passes safe ids through and hashes the rest.
- **Let the fetch proxy scope KV.** App code calls `${CRIBL_API_URL}/kvstore/{key}`;
  injecting an app segment yourself double-scopes the path and fails.
- **Check the negative phrase first.** "not a hot dog" contains "hot dog".
- **`(?i)` inline regex flags and `percentileif()` are not safe here**; see `AGENTS.md`.

`AGENTS.md` is the full engineering contract (architecture, platform rules, design system)
and `docs/cribl-app-framework.md` covers the shared framework libraries.
