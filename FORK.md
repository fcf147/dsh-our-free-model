# Our Auto Free — fork notes

This fork changes one thing about the upstream `dsh-our-free-model` plugin:

**The two keyless lanes — the anonymous OpenCode free lane and Kilo's free
pool — are collapsed into a single picker model named “Our Auto Free”.**

## What you see

In the DSH model picker, instead of a long list of `Our Free Model` and `Kilo
…` entries, there is one entry:

```
Our Auto Free   · text input · 128K context · auto-routes across N free models, refreshed with the upstream rosters
```

Selecting it and sending a message routes the turn through an automatic chain
over **all currently free models from both lanes**.

## How the routing works

- On every catalog merge (startup, periodic refresh, manual refresh, settings
  change), the plugin rebuilds the chain from the live rosters of both lanes.
  New upstream models join automatically; withdrawn ones drop out. No release
  or manual edit needed.
- The `auto` strategy orders the chain by observed quality on this machine:
  1. Models this egress already answered successfully go first.
  2. Models this egress already refused go last.
  3. Otherwise, lifetime usage is used to spread load across the pool.
- Failover is the existing combo machinery: if a candidate fails before it
  produces visible output (text or a tool call), the next one is tried and the
  caller never sees the failed attempt. Once visible output has been streamed,
  a later failure ends the turn normally.
- All other lanes (EAC, aggregate/self-keyed providers, user combos,
  subscriptions, account channels) are unchanged and remain visible in the
  picker beside “Our Auto Free”.

## Settings

**设置 → Our Free Model → 插件设置 → 合并为单个 Our Auto Free** (default on)
controls the consolidation. Turning it off restores the upstream picker with
each free/Kilo model listed individually. The underlying models stay routable
either way, so existing sessions with a saved model id keep working.

## Implementation pointers

| Concern | File |
| --- | --- |
| Virtual entry + `auto` strategy | `src/combos.js` (`buildAutoFreeEntry`, `comboChain`) |
| Catalog rebuild on merge | `src/core/runtime.js` (`rebuildCatalog`) |
| Picker-only filtering | `src/core/runtime.js` (`pickerMembership`), `src/adapter.js` (`listModels`) |
| Routing availability signal | `src/core/runtime.js` (`state().routing.availability`) |
| Settings toggle | `src/store.js`, `index.js`, `client.js` |
| Tests | `scripts/auto-free-test.mjs` |

## Test status

`node scripts/test-all.mjs --mode contributor`: **121/123 suites pass**. The two
failing suites (`legacy-upgrade`, `lane-exit`) are environmental: this fork's
shallow clone lacks a historical git commit the first needs, and `openssl` is
not installed for the second. Neither touches this change.
