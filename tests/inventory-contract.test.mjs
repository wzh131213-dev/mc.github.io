import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('every registered block has a texture tile and a display name', async () => {
  const world = await read('world.ts')
  const inventory = await read('Inventory.tsx')
  const constants = new Map(
    [...world.matchAll(/^export const ([A-Z_]+) = (\d+)$/gm)].map((m) => [m[1], Number(m[2])]),
  )
  const blockList = world.match(/export const BLOCKS = \[([^\]]+)\]/)
  assert.ok(blockList, 'BLOCKS registry must exist')
  const blockNames = blockList[1].split(',').map((s) => s.trim()).filter(Boolean)
  const tileSection = world.slice(world.indexOf('const BLOCK_TILES'), world.indexOf('// blocks that hide'))
  const nameSection = inventory.match(/const NAMES: Record<number, string> = \{([\s\S]*?)\n\}/)
  assert.ok(nameSection, 'Inventory must define block labels')
  const namedIds = new Set([...nameSection[1].matchAll(/(\d+)\s*:/g)].map((m) => Number(m[1])))

  for (const blockName of blockNames) {
    const id = constants.get(blockName)
    assert.notEqual(id, undefined, `missing numeric ID for ${blockName}`)
    assert.ok(tileSection.includes(`[${blockName}]:`), `missing atlas tile for ${blockName}`)
    assert.ok(namedIds.has(id), `missing inventory name for block ID ${id}`)
  }
})

test('inventory UI renders the registered block list instead of a stale hard-coded subset', async () => {
  const inventory = await read('Inventory.tsx')
  assert.match(inventory, /const items: number\[\] = \[\.\.\.BLOCKS\]/)
  assert.match(inventory, /items\.map\(/)
  assert.match(inventory, /role="dialog"/)
  assert.match(inventory, /aria-modal="true"/)
})

test('inventory launcher is mounted above the game layers and remains available while paused', async () => {
  const app = await read('App.tsx')
  assert.match(app, /createPortal\([\s\S]*?document\.body/)
  assert.match(app, /screen === 'playing' \|\| screen === 'paused'/)
  assert.match(app, /className="inventory-launcher"/)
  assert.match(app, /inventoryOpenRef/)
  assert.match(app, /if \(inventoryOpenRef\.current\) \{/)
  assert.match(app, /inventoryOpen && \(screen === 'playing' \|\| screen === 'paused'\)/)
  assert.match(app, /engine\?\.unlock\(\)/)
  assert.match(app, /engine\.setActive\(false\)/)
  assert.match(app, /if \(inventoryOpenRef\.current\) \{[\s\S]*?engine\.setActive\(false\)/)
  assert.match(app, /else if \(screenRef\.current === 'playing'[\s\S]*?engine\.lock\(\)/)
})

test('mining water is supported while water remains replaceable when placing blocks', async () => {
  const engine = await read('engine.ts')
  assert.match(engine, /this\.raycast\(6, kind === 'break'\)/)
  assert.match(engine, /includeWater \|\| b !== WATER/)
})

test('invalid block IDs are rejected before mutating chunk data', async () => {
  const world = await read('world.ts')
  const setBody = world.match(/  set\(x: number, y: number, z: number, b: number\) \{([\s\S]*?)\n  \}/)
  assert.ok(setBody, 'World.set must exist')
  const validation = setBody[1].indexOf('!Number.isInteger(b)')
  const write = setBody[1].indexOf('c.data[')
  assert.notEqual(validation, -1, 'World.set must validate IDs')
  assert.ok(validation < write, 'validation must occur before the typed-array write')
  assert.match(world, /const OCC = new Uint8Array\(256\)/)
})

test('Pages deployment refuses to publish the uncompiled branch source', async () => {
  const workflow = await read('.github/workflows/deploy.yml')
  assert.match(workflow, /gh api "repos\/\$\{GITHUB_REPOSITORY\}\/pages" --jq '\.build_type'/)
  assert.match(workflow, /pages_source.*!= "workflow"/)
  assert.match(workflow, /Source to GitHub Actions/)
  assert.match(workflow, /runs-on: ubuntu-26\\.04/)
  assert.match(workflow, /actions\\/upload-pages-artifact@v5/)
  assert.match(workflow, /actions\\/deploy-pages@v5/)
})

test('the production build is configured for the project Pages base path', async () => {
  const vite = await read('vite.config.ts')
  assert.match(vite, /base: '\.\/'/)
})
