# Clawtop Exec Plan

## Milestones

- [x] Milestone 0: Plan doc bootstrap
  - Create this file with milestone checklist.
  - Verify file exists and includes all milestones.
- [x] Milestone 1: Project scaffold + strict TS baseline
  - Add `package.json`, `tsconfig.json`, `src` skeleton, scripts.
  - Verify `npm run build` succeeds and `node dist/cli.js --once` renders placeholder.
- [x] Milestone 2: Collector layer (standalone, resilient)
  - Implement domain collectors with zod guards and unknown fallbacks.
  - Verify tests for parse/failure branches and `--json` snapshot output.
- [x] Milestone 3: Status engine + rule evaluation
  - Implement RED/AMBER/GREEN rules and unknown propagation.
  - Verify rule tests cover precedence and pass.
- [x] Milestone 4: Terminal renderer + refresh loop
  - Implement full-screen card render, no-flicker redraw, resize handling.
  - Verify `clawtop` auto-refreshes and `--once` exits.
- [x] Milestone 5: Repo/version drift correctness
  - Aggregate git drift across configured agent workspaces.
  - Verify mocked scenarios for clean/dirty/ahead/behind and unknown fallback.
- [x] Milestone 6: README completeness
  - Document status logic, data sources, limitations, setup/run examples.
  - Verify required sections exist.
- [x] Milestone 7: Final validation gate
  - Run `npm test`, `tsc --noEmit`, and `npm run lint`.
  - Verify all commands pass.

## Progress Rules

- Mark each milestone complete in this file before moving to the next milestone.
- Do not skip verification checks for a milestone.
