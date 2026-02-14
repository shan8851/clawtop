# clawtop

`clawtop` is a non-interactive, one-screen terminal status board for OpenClaw.

It answers one question:

> Is my OpenClaw setup healthy right now?

No keybindings, no drill-downs, no editing actions.

## Features

- One-screen card layout (htop/btop-inspired)
- Auto-refresh every 10 seconds by default
- `--once` mode for one-shot snapshots
- `--json` mode for machine-readable snapshots
- Polished startup + refresh error screens
- Partial-failure tolerant collector model (`unknown` instead of crash)
- Linux-first config/state path discovery (XDG + `~/.openclaw` fallback)
- Non-TTY-safe output (no ANSI/control escape pollution by default)

## Prerequisites

- Node.js LTS (Node 20+)
- `openclaw` CLI available on `PATH`
- Linux terminal (primary target: Ubuntu/Debian/Fedora/Arch class)
- `git` installed for repo drift checks

## Compatibility Surface

`clawtop` is standalone (no `giles-api` runtime dependency), but it depends on these OpenClaw CLI surfaces:

- `openclaw status --json`
- `openclaw security audit --json`
- `openclaw cron status --json`
- `openclaw cron list --all --json`
- `openclaw channels status --json`
- `openclaw agents list --json`
- `openclaw sessions --json --active <minutes>`
- `openclaw --version`

At startup, `clawtop` runs a compatibility guard and emits explicit warnings if key OpenClaw commands are missing or version is below the supported floor.

## Quick Start (Local Clone)

```bash
git clone <YOUR_REPO_URL>
cd clawtop
npm ci
npm run build
npm run start
```

## Install

Local development:

```bash
npm ci
```

Optional local binary link:

```bash
npm run build
npm link
# then run: clawtop
```

## Run

```bash
npm run dev
npm run build
npm run start
```

Direct examples:

```bash
node dist/cli.js
node dist/cli.js --once
node dist/cli.js --refresh 5
node dist/cli.js --active-window 120
node dist/cli.js --json
node dist/cli.js --color never
node dist/cli.js --help
```

## CLI

- `clawtop`
  - start full-screen auto-refresh board (default refresh: 10s)
- `clawtop --once`
  - render once and exit
- `clawtop --refresh <seconds>`
  - set refresh interval
- `clawtop --active-window <minutes>`
  - session active window used for Sessions card (default: 60)
- `clawtop --json`
  - print one JSON snapshot and exit
- `clawtop --compact`
  - force compact single-column layout
- `clawtop --color <auto|always|never>`
  - color mode (`auto` defaults to TTY-aware behavior)
- `clawtop --help`
  - print available options with descriptions

Environment behavior:

- `NO_COLOR=1` disables colors unless `--color always` is set.

## Screenshot-ready setup

For clean shareable screenshots:

1. Use a wide terminal window (`132x38` is a good default for the two-column board).
2. Use a legible coding font with clear box-drawing glyphs (`Iosevka Term`, `JetBrains Mono`, or `Fira Code`).
3. Pick a high-contrast theme with muted background + bright status colors.
4. Render a stable frame with:
   - `clawtop --once --color always`
5. For narrow screenshots, force single-column:
   - `clawtop --once --compact --color always`
6. For monochrome docs, disable color:
   - `NO_COLOR=1 clawtop --once`

## v1 Cards

`clawtop` renders these cards only:

1. Overall status (GREEN / AMBER / RED)
2. Security findings (critical, warning, info)
3. Cron health (enabled count, failing/recent error count)
4. Channels (configured count, connected count when detectable)
5. Agents (configured count)
6. Sessions (active count)
7. Repo drift (clean/dirty + ahead/behind where available)
8. Version drift (installed OpenClaw vs latest)

## Status Color Logic

`RED` if any condition is true:

- critical security findings > 0
- failing cron jobs > 0
- gateway unreachable

`AMBER` if `RED` is false and any condition is true:

- warning findings > 0
- unknown state in critical cards
- repo drift (dirty or behind > 0)

`GREEN` otherwise.

## Data Source Approach (Standalone)

`clawtop` does not call `giles-api` runtime endpoints.

Primary sources:

- OpenClaw CLI JSON/text outputs
- local OpenClaw config/state files
- local `git` inspection for repo drift

Linux-first path behavior:

- Config roots: `$XDG_CONFIG_HOME/openclaw` -> `~/.config/openclaw` -> `~/.openclaw`
- State roots: `$XDG_STATE_HOME/openclaw` -> `~/.local/state/openclaw` -> `~/.openclaw`

## Unknown and Failure Behavior

- Missing commands, timeouts, parse mismatches, or unsupported fields do not crash the board.
- Unknown values are surfaced explicitly and the board continues rendering.
- Unknown critical health signals contribute to `AMBER` state.
- Repo upstream absence is reported separately from generic git command failures.

## JSON Output

`--json` emits one snapshot with:

- all card metrics
- overall status and reasons
- structured warnings (`source`, `code`, `severity`, `reason`, optional `context`)

## Troubleshooting

Common warnings and what to do:

- `compatibility/openclaw_binary_unavailable`
  - Ensure `openclaw` is installed and on `PATH`.
- `compatibility/openclaw_command_missing`
  - Your OpenClaw CLI may be too old/new for this clawtop version.
- `repoDrift/repo_upstream_missing`
  - Configure upstream branch (`git branch --set-upstream-to ...`) for that repo.
- `repoDrift/workspace_not_git_repo`
  - The workspace path is not a git repo; drift will stay unknown.
- `channels/channels_connected_unknown`
  - Provider does not expose a detectable connected signal in current CLI output.

## Limitations (v1)

- Non-interactive by design
- No historical trend storage
- No remote fleet/multi-node aggregation
- No remediation actions
- `--json` emits a point-in-time snapshot (not a stream)

## Development Validation

```bash
npm test
npm run typecheck
npm run lint
```
