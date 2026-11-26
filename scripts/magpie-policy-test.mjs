/**
 * Five account channels stay out of the model workspace.
 *
 * This fork offers WorkBuddy China (workbuddy / CodeBuddy / buddy) and Huawei
 * Cloud MaaS (huaweicloud / codearts) again. Excluded are WorkBuddy
 * international ("workbuddy-ai") plus the four channels removed after upstream
 * stopped offering their free daily check-in (qoder, qodercn, raccoon, zcode).
 * The engine is a pinned binary whose plugin market is fetched at run time, so
 * the exclusion is enforced on this application's own management boundary:
 * market and provider answers are filtered, mutations are refused, and a model
 * the engine serves through an excluded channel never reaches the catalog.
 *
 * Runs against the real pinned executable, like magpie-engine-test.
 * Build first: node scripts/build-magpie-engine.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createMagpieEngine, MAGPIE_UI_PREFIX as prefix } from '../src/magpie-engine.js'
import { createMagpieModels } from '../src/magpie-models.js'
import { assertEngineMutation, deniedModel, filterEngineJSON, POLICY_REFUSED } from '../src/magpie-policy.js'
import { pinnedEngineEntry } from './lib/engine-binary.mjs'

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ofm-magpie-policy-'))
const saved = new Map()
for (const [name, value] of Object.entries({
  HOME: path.join(scratch, 'native-home'),
  USERPROFILE: path.join(scratch, 'native-home'),
  XDG_CONFIG_HOME: path.join(scratch, 'native-config'),
  XDG_CACHE_HOME: path.join(scratch, 'native-cache'),
  XDG_DATA_HOME: path.join(scratch, 'native-data'),
  XDG_STATE_HOME: path.join(scratch, 'native-state'),
})) {
  saved.set(name, process.env[name])
  process.env[name] = value
  fs.mkdirSync(value, { recursive: true })
}

// The five denied channels. DENIED mirrors src/magpie-policy.js: separator
// tolerance covers "workbuddy-ai", "workbuddy ai" and "workbuddy_ai" without
// swallowing the restored China/Huawei spellings; the longer qodercn alias is
// listed before qoder so the redactor never leaves a fragment behind.
const INTERNATIONAL = /workbuddy[\s_-]*ai/i
const DENIED = /(?:workbuddy[\s_-]*ai|qodercn|qoder|raccoon|zcode)/i
const INTL_PACKAGE = '@magpie-community/opencode-workbuddy-ai-auth'
const CHINA_PACKAGE = '@magpie-community/opencode-workbuddy-auth'
const CODEARTS_PACKAGE = '@magpie-community/opencode-codearts-auth'
const IDS = ['workbuddy-ai', 'qoder', 'qodercn', 'raccoon', 'zcode'] // denied subscription ids
// Every alias this fork offers again: none may be filtered or refused.
const RESTORED_IDS = ['workbuddy', 'codebuddy', 'buddy', 'codebuddy-cn', 'huaweicloud', 'codearts']
const RESTORED_NAMES = /workbuddy|codebuddy|huaweicloud|huawei[\s-]*cloud|modelarts|codearts|华为云|码道/i
const engine = createMagpieEngine({ dataDir: path.join(scratch, 'data'), logger: {} })
let checks = 0
const check = async (name, run) => {
  await run()
  checks++
  console.log(`ok ${checks} - ${name}`)
}
const server = http.createServer((req, res) => {
  const subpath = req.url.startsWith(prefix) ? req.url.slice(prefix.length) : req.url
  engine.proxy(req, res, subpath).catch(() => { try { res.destroy() } catch {} })
})
const listen = () => new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))
})
const mentionsDenied = value => DENIED.test(JSON.stringify(value))
const denied = async (method, route, body) => {
  try {
    await engine.request(method, route, body === undefined ? {} : { body })
    return false
  } catch (error) {
    return error.statusCode === 403 && error.message === POLICY_REFUSED
  }
}
const notRefused = async (method, route, body) => {
  try {
    const response = await engine.request(method, route, { body })
    await response.text()
    return true
  } catch (error) {
    // A restored channel may fail for unrelated engine reasons (unknown
    // package, no such account). What matters is that policy does not refuse it.
    return !(error.statusCode === 403 && error.message === POLICY_REFUSED)
  }
}

try {
  // The engine-backed groups need this platform's pinned binary; the pure-function
  // group at the end does not, so it still runs on a platform with no binary.
  const hasEngine = pinnedEngineEntry() !== null
  if (hasEngine) await engine.start()
  else console.log(`ok  engine-backed policy groups skipped: no pinned engine binary for ${process.platform}-${process.arch}`)
  const origin = hasEngine ? await listen() : null
  const base = origin === null ? null : origin + prefix
  // Engine market answers are live network reads (sometimes tens of seconds).
  // Several groups assert different properties of the same routes; cache them
  // so the suite finishes comfortably inside the runner's 120s deadline.
  const readCache = new Map()
  const read = async route => {
    if (readCache.has(route)) return readCache.get(route)
    // The engine proxies the live plugin market; a transient upstream 502/503
    // must not fail an otherwise-correct policy assertion. Retry once.
    let response = await fetch(base + route)
    if ([502, 503, 504].includes(response.status)) {
      await new Promise(resolve => setTimeout(resolve, 800))
      response = await fetch(base + route)
    }
    assert.equal(response.status, 200, route)
    const value = await response.json()
    readCache.set(route, value)
    return value
  }
  const post = async (route, body) => fetch(base + route, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const engineCheck = async (name, run) => {
    if (!hasEngine) return
    await check(name, run)
  }

  // 1. All five denied channels stay out of every market/list surface.
  await engineCheck('the plugin market no longer offers the denied channels', async () => {
    const listings = await read('api/plugins/listings')
    assert(!mentionsDenied(listings.listings), 'listings must not name a denied channel')
    assert(listings.listings.length > 5, 'other listings stay')
    const market = await read('api/plugins/market')
    assert(!mentionsDenied(market.listings), 'market listings must not name a denied channel')
    assert(market.listings.length > 5, 'other market listings stay')
    assert(Array.isArray(market.state.plugins), 'market state stays intact')
  })

  await engineCheck('npm search and metadata leave the denied packages out', async () => {
    for (const q of ['workbuddy', 'workbuddy-ai', 'workbuddy ai', 'qoder', 'qodercn', 'raccoon', 'zcode', 'codearts', 'codebuddy']) {
      let search
      try {
        search = await read('api/plugins/search?q=' + encodeURIComponent(q))
      } catch (error) {
        // The live npm registry can rate-limit the engine's search (429 -> 400).
        // A failed upstream read carries no channel names, so there is nothing
        // for policy to filter; the npm metadata assertions below still run.
        if (error.message.includes(encodeURIComponent(q)) && /400|429/.test(error.message)) continue
        throw error
      }
      assert(!search.hits.some(hit => mentionsDenied(hit.package)), `search hits for ${q} must not name a denied channel`)
    }
    // Every denied channel's own package is filtered from npm metadata; a
    // genuinely unrelated package and the restored China/CodeArts packages
    // are not refused by policy.
    const names = [`${INTL_PACKAGE},${CHINA_PACKAGE},${CODEARTS_PACKAGE},@magpie-community/opencode-moonshot-cn-auth`,
      ...IDS.map(id => `@magpie-community/opencode-${id}-auth`)]
    for (const batch of names) {
      const npm = await read('api/plugins/npm?names=' + encodeURIComponent(batch))
      assert(!Object.keys(npm.npm).some(name => mentionsDenied(name)), 'npm metadata must not name a denied channel')
    }
    const unrelated = await read('api/plugins/npm?names=' + encodeURIComponent('@magpie-community/opencode-moonshot-cn-auth'))
    assert(Object.keys(unrelated.npm).includes('@magpie-community/opencode-moonshot-cn-auth'), 'unrelated package still answered')
    const page = await fetch(base + 'api/plugins/page?name=' + encodeURIComponent(INTL_PACKAGE))
    assert.equal(page.status, 403)
    assert.match(await page.text(), /not offered by this build/)
    // Restored channels' detail pages are reachable (not refused by policy).
    for (const name of [CHINA_PACKAGE, CODEARTS_PACKAGE]) {
      const ok = await fetch(base + 'api/plugins/page?name=' + encodeURIComponent(name))
      assert.notEqual(ok.status, 403, `${name} page is not refused`)
      await ok.text()
    }
  })

  await engineCheck('installed-plugin and update listings exclude all denied channels', async () => {
    for (const route of ['api/plugins', 'api/plugins/updates', 'api/plugin-pages', 'api/plugin-panels',
      'api/plugins/github', 'api/usage/quotas', 'api/login/usage']) {
      assert(!mentionsDenied(await read(route)), `${route} must not name a denied channel`)
    }
    const checked = await (await post('api/plugins/check', {})).json()
    assert(!mentionsDenied(checked), 'a version check must not name a denied channel')
  })

  // 2. Restored channels appear on the actionable surfaces again.
  await engineCheck('restored China and Huawei Cloud channels reach the market and provider surfaces', async () => {
    const listings = await read('api/plugins/listings')
    assert(listings.listings.some(row => row.package === CODEARTS_PACKAGE),
      'the restored CodeArts plugin is offered again')
    assert(listings.listings.some(row => RESTORED_NAMES.test(JSON.stringify(row))),
      'a restored channel appears in the listings')
    const market = await read('api/plugins/market')
    assert(market.listings.some(row => row.package === CODEARTS_PACKAGE),
      'the restored CodeArts plugin is in the market again')

    const providers = await read('api/providers')
    assert(providers.presets.some(preset => preset.id === 'huaweicloud'), 'Huawei Cloud preset is back')
    assert(providers.presets.some(preset => /huawei/i.test(preset.name)), 'Huawei Cloud preset name is back')
    assert(Object.keys(providers.movesTo || {}).some(id => RESTORED_IDS.includes(id)), 'a restored move target is back')
    const upstream = await read('api/upstream')
    assert(!mentionsDenied(upstream), 'vendor status excludes all denied channels')
  })

  await engineCheck('all five denied channels are absent and refused everywhere they can act', async () => {
    const spellings = DENIED
    const actionable = ['api/plugins', 'api/plugins/listings', 'api/plugins/market',
      'api/plugins/updates', 'api/plugin-pages', 'api/plugin-panels', 'api/importapps', 'api/upstream',
      'api/login/usage', 'api/usage/quotas']
    for (const route of actionable) {
      const answer = await read(route)
      assert(!spellings.test(JSON.stringify(answer)), `${route} must not name a denied channel`)
    }
    const providers = await read('api/providers')
    assert(!providers.presets.some(preset => spellings.test(preset.id) || spellings.test(preset.name)),
      'no preset offers a denied channel')
    assert(!Object.keys(providers.movesTo ?? {}).some(id => IDS.includes(id)),
      'no move target reaches a denied channel')
    assert(!(providers.plugins ?? []).some(row => spellings.test(JSON.stringify(row))),
      'no plugin row offers a denied channel')
    assert(!(providers.unmoved ?? []).some(row => spellings.test(JSON.stringify(row))),
      'no retired denied built-in is offered')
    // The deprecation list stays whole: the add sheet reads it to hide a
    // built-in tile, and dropping an id would surface that tile again. Only
    // the denied channels that were built-ins appear here; the four channels
    // removed from the channel pack were never built-ins.
    assert(IDS.some(id => providers.movable.includes(id)), 'movable keeps the denied built-ins')

    // Every denied id and every spelling is refused where a mutation could
    // enable one.
    for (const spec of [INTL_PACKAGE, '@magpie-community/opencode-workbuddy_ai-auth',
      '@magpie-community/opencode-workbuddy ai-auth',
      ...IDS.map(id => `@magpie-community/opencode-${id}-auth`)]) {
      assert(await denied('POST', '/api/plugins/add', { spec }), `${spec} add is refused`)
    }
    for (const id of IDS) {
      for (const [route, body] of [
        ['/api/plugins/add', { spec: `@magpie-community/opencode-${id}-auth` }],
        ['/api/plugins/upgrade', { spec: `@magpie-community/opencode-${id}-auth` }],
        ['/api/plugins/off', { spec: `@magpie-community/opencode-${id}-auth`, off: false }],
        ['/api/plugin-signin', { provider: id, method: 0 }],
        ['/api/plugin-signin/prompt', { provider: id, method: 0 }],
        ['/api/signin', { agent: id }],
        ['/api/signin/import', { agent: id }],
        ['/api/login/use', { agent: id, user: 'fixture' }],
        ['/api/provider/move', { id }],
        ['/api/provider/save', { preset: id, key: 'fixture' }],
        ['/api/provider/save', { id, name: id, key: 'fixture' }],
      ]) assert(await denied('POST', route, body), `${route} ${JSON.stringify(body)} is refused`)
    }
  })

  await check('restored channels are not refused on install, login or preset save', async () => {
    // Pure policy check: the engine would forward these as real install/login
    // attempts to the live market (slow and flaky). What this suite owns is
    // the refusal decision, which assertEngineMutation exposes directly.
    for (const spec of [CHINA_PACKAGE, CODEARTS_PACKAGE]) {
      assert.doesNotThrow(() => assertEngineMutation('POST', '/api/plugins/add', { spec }), `${spec} install is not refused`)
    }
    for (const agent of ['workbuddy', 'codebuddy', 'buddy', 'codearts']) {
      assert.doesNotThrow(() => assertEngineMutation('POST', '/api/signin', { agent }), `${agent} sign-in is not refused`)
      assert.doesNotThrow(() => assertEngineMutation('POST', '/api/plugin-signin', { provider: agent, method: 0 }), `${agent} plugin sign-in is not refused`)
    }
    for (const preset of ['workbuddy', 'codebuddy', 'buddy', 'codebuddy-cn', 'huaweicloud', 'codearts']) {
      assert.doesNotThrow(() => assertEngineMutation('POST', '/api/provider/save', { preset, key: 'fixture' }), `${preset} preset is not refused`)
    }
    for (const body of [
      { id: 'codebuddy', name: 'CodeBuddy', key: 'fixture' },
      { id: 'huaweicloud', name: 'Huawei Cloud MaaS', key: 'fixture' },
      { id: 'codearts', name: 'CodeArts', key: 'fixture' },
    ]) assert.doesNotThrow(() => assertEngineMutation('POST', '/api/provider/save', body), `named save ${JSON.stringify(body)} is not refused`)
    assert.doesNotThrow(() => assertEngineMutation('POST', '/api/provider/save', { preset: 'moonshot-cn', key: 'fixture', name: 'unrelated' }))
  })

  await engineCheck('the import picker keeps restored channels and drops all denied ones', async () => {
    const sources = await read('api/importapps')
    for (const source of sources) {
      assert(!(source.items || []).some(item => IDS.includes(item?.provider?.id)), source.id)
      assert(!mentionsDenied(source), `${source.id} must not name a denied channel`)
    }
    assert(sources.length > 0, 'import sources stay reachable')
  })

  await engineCheck('the engine refuses to install, enable or sign in any denied channel', async () => {
    for (const id of IDS) {
      const spec = `@magpie-community/opencode-${id}-auth`
      assert(await denied('POST', '/api/plugins/add', { spec }), `${id} add`)
      assert(await denied('POST', '/api/plugins/upgrade', { spec }), `${id} upgrade`)
      assert(await denied('POST', '/api/plugins/off', { spec, off: false }), `${id} re-enable`)
      assert(await denied('POST', '/api/plugin-signin', { provider: id, method: 0 }), `${id} plugin sign-in`)
      assert(await denied('POST', '/api/plugin-signin/prompt', { provider: id, method: 0 }), `${id} plugin prompt`)
      assert(await denied('POST', '/api/signin', { agent: id }), `${id} subscription sign-in`)
      assert(await denied('POST', '/api/login/use', { agent: id, user: 'fixture' }), `${id} account switch`)
      assert(await denied('POST', '/api/provider/move', { id }), `${id} move`)
    }
  })

  await engineCheck('the way out of an earlier install is left open', async () => {
    // Hiding the channel must not trap a plugin installed before this change:
    // switching it off and removing it are not refused by policy (the engine
    // answers for a plugin it doesn't have, which is a different failure).
    for (const spec of [INTL_PACKAGE, ...IDS.map(id => `@magpie-community/opencode-${id}-auth`)]) {
      for (const [route, body] of [
        ['/api/plugins/off', { spec, off: true }],
        ['/api/plugins/remove', { spec }],
      ]) {
        try {
          const response = await engine.request('POST', route, { body })
          assert.notEqual(response.status, 403, route)
          await response.text()
        } catch (error) {
          assert.notEqual(error.message, POLICY_REFUSED, route)
        }
      }
    }
  })

  await engineCheck('the refusal is enforced through the browser proxy too', async () => {
    for (const id of IDS) {
      const spec = `@magpie-community/opencode-${id}-auth`
      for (const [route, body] of [
        ['api/plugins/add', { spec }],
        ['api/signin', { agent: id }],
        ['api/plugin-signin', { provider: id, method: 0 }],
        ['api/provider/move', { id }],
      ]) {
        const response = await post(route, body)
        assert.equal(response.status, 403, `${route} ${id}`)
        assert.match(await response.text(), /not offered by this build/, `${route} ${id}`)
      }
      const page = await fetch(base + 'api/plugins/page?name=' + encodeURIComponent(spec))
      assert.equal(page.status, 403, `${id} detail page`)
    }
  })

  await engineCheck('unrelated work on the same routes still reaches the engine', async () => {
    const other = await post('api/plugins/add', { spec: '@ofm-absent-package' })
    assert.notEqual(other.status, 403, 'an unrelated install is not refused by policy')
    const discovery = await post('api/settings/account-discovery', { off: true })
    assert.equal(discovery.status, 200, 'settings still writable')
    const unknown = await post('api/signin', { agent: 'ofm-missing-login-fixture' })
    assert.doesNotMatch(await unknown.text(), /not offered by this build/)
    const settings = await read('api/settings')
    assert.equal(typeof settings.noAccountDiscovery, 'boolean', 'settings still answered')
  })

  await engineCheck('a model served through a denied channel never reaches the published catalog', async () => {
    const models = createMagpieModels({
      engine,
      stats: { record() {} },
      logger: {},
      onChanged: () => {},
    })
    try {
      assert.equal(deniedModel({ id: 'glm-5.3-flash', owned_by: 'workbuddy-ai' }), true, 'by provider')
      assert.equal(deniedModel({ id: 'workbuddy-ai/glm-5.3-flash', owned_by: 'x' }), true, 'by id')
      assert.equal(deniedModel({ id: 'workbuddy_ai/glm-5.3-flash', owned_by: 'x' }), true, 'underscored id')
      assert.equal(deniedModel({ id: 'workbuddy ai/glm-5.3-flash', owned_by: 'x' }), true, 'spaced id')
      for (const id of IDS.slice(1)) {
        assert.equal(deniedModel({ id: 'glm-5.3-flash', owned_by: id }), true, `${id} provider`)
        assert.equal(deniedModel({ id: `${id}/glm-5.3-flash`, owned_by: 'x' }), true, `${id} id`)
      }
      for (const owned_by of ['workbuddy', 'codebuddy', 'buddy', 'codebuddy-cn', 'huaweicloud', 'codearts']) {
        assert.equal(deniedModel({ id: 'glm-5.3-flash', owned_by }), false, `${owned_by} stays`)
      }
      assert.equal(deniedModel({ id: 'codearts/glm-5.3-flash', owned_by: 'x' }), false, 'codearts id stays')
      assert.equal(deniedModel({ id: 'gpt-6.1-sol', owned_by: 'codex' }), false, 'others stay')
      await models.refresh()
      assert(!mentionsDenied(models.catalog()), 'published catalog excludes all denied channels')
    } finally { models.close() }
  })

  await check('the filter is a pure function of the route and the answer', async () => {
    const listings = { listings: [
      { package: INTL_PACKAGE, name: 'WorkBuddy AI', providers: ['workbuddy-ai'] },
      { package: CODEARTS_PACKAGE, name: 'CodeArts / OfficeAce', providers: ['codearts', 'officeace'] },
      { package: CHINA_PACKAGE, name: 'WorkBuddy (CodeBuddy)', providers: ['workbuddy'] },
      { package: '@magpie-community/opencode-zcode-auth', name: 'ZCode', providers: ['zcode'] },
    ] }
    const filtered = filterEngineJSON('/api/plugins/listings', structuredClone(listings))
    assert.deepEqual(filtered.listings.map(row => row.package),
      [CODEARTS_PACKAGE, CHINA_PACKAGE],
      'the international and zcode listings are dropped')
    const unknown = { anything: 1 }
    assert.equal(filterEngineJSON('/api/settings', unknown), unknown, 'other routes pass through')
    for (const id of IDS) {
      assert.throws(() => assertEngineMutation('POST', '/api/plugins/add', { spec: `@magpie-community/opencode-${id}-auth` }), /not offered/)
      assert.throws(() => assertEngineMutation('POST', '/api/signin', { agent: id }), /not offered/)
    }
    assert.doesNotThrow(() => assertEngineMutation('POST', '/api/plugins/add', { spec: CHINA_PACKAGE }))
    assert.doesNotThrow(() => assertEngineMutation('POST', '/api/plugins/add', { spec: CODEARTS_PACKAGE }))
    assert.doesNotThrow(() => assertEngineMutation('GET', '/api/plugins/add', { spec: INTL_PACKAGE }))
  })

  await check('third-party prose naming workbuddy-ai is rewritten, restored names are not', async () => {
    // A real market listing (Agent Office) reads the session files of many
    // desktop tools. Only the international name must be rewritten out.
    const agentOffice = {
      package: '@magpie-community/page-agent-office', name: 'Agent Office', community: true, kind: 'page',
      summary: {
        en: 'Reads the session files of Claude Code, Codex, WorkBuddy AI, WorkBuddy, CodeBuddy, Huawei Cloud CodeArts and Grok Build on this computer.',
        zh: '读取本机 Claude Code、Codex、WorkBuddy AI、WorkBuddy、CodeBuddy、华为云 CodeArts 的会话文件。',
      },
    }
    const filtered = filterEngineJSON('/api/plugins/listings', {
      listings: [structuredClone(agentOffice), { package: INTL_PACKAGE, name: 'WorkBuddy AI', providers: ['workbuddy-ai'] }],
    })
    assert.equal(filtered.listings.length, 1, 'the international listing is dropped')
    assert.equal(filtered.listings[0].package, agentOffice.package, 'the unrelated listing stays')
    assert.equal(filtered.listings[0].name, 'Agent Office')
    assert.match(filtered.listings[0].summary.en, /a desktop coding tool/)
    assert.doesNotMatch(filtered.listings[0].summary.en, /workbuddy[\s_-]*ai/i)
    // WorkBuddy / CodeBuddy / the Huawei Cloud names are ordinary prose now.
    assert.match(filtered.listings[0].summary.en, /WorkBuddy, CodeBuddy, Huawei Cloud CodeArts/)
    assert.match(filtered.listings[0].summary.zh, /WorkBuddy、CodeBuddy、华为云 CodeArts/)
    assert.match(filtered.listings[0].summary.zh, /某桌面编码工具/)
    assert.doesNotMatch(filtered.listings[0].summary.zh, /workbuddy[\s_-]*ai/i)
    const npm = filterEngineJSON('/api/plugins/npm', {
      npm: { [agentOffice.package]: { description: agentOffice.summary.en } },
    })
    assert.equal(npm.npm[agentOffice.package].description.includes('workbuddy ai'), false, 'npm prose is rewritten too')
    assert.match(npm.npm[agentOffice.package].description, /CodeBuddy, Huawei Cloud CodeArts/)
    // The deprecation list keeps exact ids (even denied ones); a denied preset,
    // being the way onto the channel, is filtered out.
    const providers = { movable: ['workbuddy', 'workbuddy-ai', 'codearts', 'zcode'], presets: [{ id: 'zcode', name: 'ZCode' }] }
    const filteredProviders = filterEngineJSON('/api/providers', structuredClone(providers))
    assert.deepEqual(filteredProviders.movable,
      ['workbuddy', 'workbuddy-ai', 'codearts', 'zcode'], 'provider ids are not redacted')
    assert.deepEqual(filteredProviders.presets, [], 'the zcode preset is filtered')
  })

  await check('the disclaimer names only the international channel and states the restored ones', async () => {
    const { DISCLAIMER, DISCLAIMER_VERSION, EXCLUDED_CHANNELS } = await import('../src/disclaimer.js')
    assert.equal(DISCLAIMER_VERSION, 3, 'disclaimer copy is version 3')
    assert.equal(DISCLAIMER.version, 3, 'the published copy carries version 3')
    assert.equal(EXCLUDED_CHANNELS.length, 1, 'only one channel is excluded')
    assert.equal(EXCLUDED_CHANNELS[0], 'WorkBuddy 国际版（workbuddy-ai）', 'the excluded channel is workbuddy-ai')
    const named = EXCLUDED_CHANNELS.join(' ').toLowerCase()
    assert.match(named, /workbuddy-ai/, 'the disclaimer names workbuddy-ai')
    assert(!/codebuddy|huaweicloud|codearts|华为云|码道/i.test(named), 'restored channels are not excluded')

    const body = DISCLAIMER.sections.map(section => section.body).join(' ')
    assert.match(body, /不包含、也不提供 WorkBuddy 国际版（workbuddy-ai）/, 'it says the international build is not provided')
    assert.match(body, /WorkBuddy 国内版（CodeBuddy）与华为云 Huawei Cloud MaaS（CodeArts）在本 fork 中已重新提供/,
      'it states the China and Huawei Cloud channels are offered again')
    assert.match(body, /与本项目作者及团队无关/, 'it states the team is not responsible')
    assert.match(body, /个人学习/, 'it states the project purpose')
    assert.match(body, /自行承担/, 'it places the consequences on the user')
  })

  console.log(`magpie-policy: ${checks} checks passed`)
} finally {
  await engine.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  // Windows can briefly keep the engine's files locked after close(), and the
  // temp root carries a non-ASCII user name here. A transient EPERM must not
  // turn a green run into a failing exit.
  for (let attempt = 0; attempt < 5; attempt++) {
    try { fs.rmSync(scratch, { recursive: true, force: true }); break }
    catch (error) {
      if (error.code !== 'EPERM' && error.code !== 'EBUSY') throw error
      if (attempt === 4) console.warn(`magpie-policy: could not remove scratch dir ${scratch}: ${error.code}`)
      else await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)))
    }
  }
}
