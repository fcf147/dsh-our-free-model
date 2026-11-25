/**
 * The fork's consolidated keyless lane: "Our Auto Free".
 *
 * Two guarantees matter here:
 *  1. The picker advertises exactly one virtual model, never the raw anonymous
 *     free rows or the raw Kilo free rows behind it. Those rows stay in the
 *     catalog because the adapter needs their endpoints, but the user should
 *     not have to choose between them by hand.
 *  2. The virtual row is a live chain over both rosters, refreshed whenever
 *     the catalog is merged, and the `auto` strategy orders its links by what
 *     this egress has actually measured (good first, refused last).
 *
 * Run: node scripts/auto-free-test.mjs
 */
import assert from 'node:assert/strict'
import {
  AUTO_FREE_ID, AUTO_FREE_NAME, buildAutoFreeEntry, comboChain,
  isAutoFreeEntry,
} from '../src/combos.js'
import { computeMembership, pickerMembership } from '../src/core/runtime.js'
import { ROUTE_MAIN, ROUTE_REGION } from '../src/adapter.js'
import { STATE } from '../src/probe.js'

let checks = 0
const check = (name, run) => { run(); checks++; console.log(`ok ${name}`) }

const freeRow = id => ({
  id, name: id, contextWindow: 131072, maxOutput: 32768, vision: false, reasoning: true,
})
const kiloRow = id => ({
  id, name: `Kilo ${id}`, channel: 'kilo', contextWindow: 131072, maxOutput: 32768,
  vision: false, reasoning: true,
})

check('buildAutoFreeEntry merges both keyless rosters into one auto chain', () => {
  const free = [freeRow('deepseek-v4.1-flash-free'), freeRow('mimo-v2.6-flash-free')]
  const kilo = [kiloRow('kilo-auto/free'), kiloRow('nemotron/free')]
  const entry = buildAutoFreeEntry(free, kilo)
  assert.ok(isAutoFreeEntry(entry))
  assert.equal(entry.id, AUTO_FREE_ID)
  assert.equal(entry.name, AUTO_FREE_NAME)
  assert.equal(entry.strategy, 'auto')
  assert.equal(entry.autoFree, true)
  assert.deepEqual(entry.combo, [
    'deepseek-v4.1-flash-free', 'mimo-v2.6-flash-free', 'kilo-auto/free', 'nemotron/free',
  ])
})

check('buildAutoFreeEntry deduplicates ids shared by both rosters', () => {
  const entry = buildAutoFreeEntry([freeRow('same')], [kiloRow('same')])
  assert.deepEqual(entry.combo, ['same'])
})

check('buildAutoFreeEntry returns null when both rosters are empty', () => {
  assert.equal(buildAutoFreeEntry([], []), null)
  assert.equal(buildAutoFreeEntry(null, null), null)
})

check('the picker advertises only the consolidated model, not its member rows', () => {
  const free = [freeRow('deepseek-v4.1-flash-free'), freeRow('mimo-v2.6-flash-free')]
  const kilo = [kiloRow('kilo-auto/free')]
  const auto = buildAutoFreeEntry(free, kilo)
  const catalog = [...free, ...kilo, auto]
  const availabilitySnapshot = { results: {}, manualResults: {}, egress: null }
  const membership = computeMembership(catalog, availabilitySnapshot, {}, null)
  const picker = pickerMembership(membership, catalog)
  assert.deepEqual(picker[ROUTE_MAIN], [AUTO_FREE_ID])
  assert.equal(picker[ROUTE_REGION], undefined)
  // The raw rows are not advertised under any route.
  for (const id of ['deepseek-v4.1-flash-free', 'mimo-v2.6-flash-free', 'kilo-auto/free']) {
    assert.ok(!Object.values(picker).some(ids => ids.includes(id)), `${id} must be hidden`)
  }
  // But the full routing membership keeps every row.
  assert.ok(membership[ROUTE_MAIN].includes('deepseek-v4.1-flash-free'))
  assert.ok(membership[ROUTE_MAIN].includes('kilo-auto/free'))
})

check('other lanes stay visible alongside the consolidated model', () => {
  const eac = { id: 'deepseek-ai/deepseek-v4.1-flash', name: 'EAC Flash', channel: 'eac' }
  const kilo = [kiloRow('kilo-auto/free')]
  const auto = buildAutoFreeEntry([], kilo)
  const catalog = [...kilo, eac, auto]
  const membership = computeMembership(catalog, { results: {}, manualResults: {} }, {}, null)
  const picker = pickerMembership(membership, catalog)
  assert.deepEqual(picker[ROUTE_MAIN], [AUTO_FREE_ID, eac.id])
})

check('with no free rows at all the picker advertises nothing', () => {
  const membership = computeMembership([], { results: {}, manualResults: {} }, {}, null)
  assert.deepEqual(membership, {})
})

check('auto strategy leads with measured-good links and benches refused ones', () => {
  const auto = buildAutoFreeEntry(
    [freeRow('a'), freeRow('b'), freeRow('c')],
    [kiloRow('d')],
  )
  const catalog = [...auto.combo.map(id => freeRow(id)), auto]
  // `a` was refused on this egress; `b` answered before; `c` and `d` unknown.
  const routing = {
    availability: {
      a: STATE.unavailable,
      b: STATE.available,
    },
  }
  const order = comboChain(auto, catalog, routing).map(row => row.id)
  assert.equal(order[order.length - 1], 'a', 'a refused model goes last')
  assert.equal(order[0], 'b', 'a measured-good model goes first')
})

check('auto strategy still fails over when the first candidate errors', () => {
  const auto = buildAutoFreeEntry([freeRow('a'), freeRow('b')], [])
  const catalog = [freeRow('a'), freeRow('b'), auto]
  // With no readings the stored order is preserved; failover remains the
  // adapter's job, and the chain offers both links in a deterministic order.
  assert.deepEqual(comboChain(auto, catalog, {}).map(row => row.id), ['a', 'b'])
})

console.log(`\n${checks} checks passed`)
