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
  assert.ok(workflow.includes('runs-on: ubuntu-26.04'))
  assert.ok(workflow.includes('uses: actions/upload-pages-artifact@v5'))
  assert.ok(workflow.includes('uses: actions/deploy-pages@v5'))
})

test('the production build is configured for the project Pages base path', async () => {
  const vite = await read('vite.config.ts')
  assert.match(vite, /base: '\.\/'/)
})


test('modified chunks are saved per world seed and safely restored on demand', async () => {
  const world = await read('world.ts')
  const engine = await read('engine.ts')
  assert.match(world, /WORLD_SAVE_PREFIX = 'mc-web-world:v1:'/)
  assert.match(world, /private restoreChunk\(chunk: Chunk\)/)
  assert.match(world, /private persistChunk\(chunk: Chunk\): boolean/)
  assert.match(world, /this\.restoreChunk\(c\)/)
  assert.match(world, /chunk\.overrides\.set\(index, block\)/)
  assert.match(world, /this\.storage\.setItem\(key, JSON\.stringify/)
  assert.match(world, /this\.persistChunk\(c\)/)
  assert.match(world, /save\(\): boolean/)
  assert.match(engine, /saveWorld\(\)/)
})

test('hotbar layout survives reload and save failures are shown to the player', async () => {
  const app = await read('App.tsx')
  assert.match(app, /HOTBAR_STORAGE_KEY = 'mc-web-hotbar:v1'/)
  assert.match(app, /function readSavedHotbar\(\)/)
  assert.match(app, /window\.localStorage\.setItem\(HOTBAR_STORAGE_KEY/)
  assert.match(app, /eng\?\.saveWorld\(\)/)
  assert.match(app, /本地存储不可用：当前世界修改可能无法保存/)
})


test('Minecraft 26.3 catalog contains the complete published item and block registries', async () => {
  const registry = JSON.parse(await read('minecraft-26.3-registry.json'))
  assert.equal(registry.version, '26.3')
  assert.equal(registry.items.length, 1657)
  assert.equal(registry.blocks.length, 1285)
  assert.ok(registry.items.some((item) => item.name === 'diamond_sword'))
  assert.ok(registry.items.some((item) => item.name === 'poplar_boat'))
  assert.ok(registry.items.some((item) => item.name === 'abandoned_camp_map'))
  assert.ok(registry.blocks.some((block) => block.name === 'poplar_log'))
  assert.ok(registry.blocks.some((block) => block.name === 'straw_bed'))
  assert.ok(registry.blocks.some((block) => block.name === 'white_cushion'))
})

test('all 26.3 placeable block registry entries have stable internal IDs and 16-bit chunk storage', async () => {
  const world = await read('world.ts')
  assert.match(world, /import MINECRAFT_REGISTRY from '\.\/minecraft-26\.3-registry\.json'/)
  assert.match(world, /BLOCK_ID_BY_NAME/)
  assert.match(world, /EXTRA_BLOCK_ID_BASE/)
  assert.match(world, /new Uint16Array\(CS \* CS \* SY\)/)
  assert.match(world, /new Uint8Array\(8192\)/)
  assert.match(world, /MINECRAFT_REGISTRY\.blocks/)
  assert.match(world, /boundingBox/)
})

test('creative inventory browses the full item catalog with search and category filters', async () => {
  const inventory = await read('Inventory.tsx')
  assert.match(inventory, /MINECRAFT_REGISTRY\.items/)
  assert.match(inventory, /search/)
  assert.match(inventory, /category/)
  assert.match(inventory, /全部/)
  assert.match(inventory, /1657|itemCount/)
  assert.match(inventory, /BLOCK_ID_BY_NAME/)
})
