import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('all registered blocks have a generated icon path and a data-driven display name', async () => {
  const world = await read('world.ts')
  const registry = JSON.parse(await read('minecraft-26.3-registry.json'))
  assert.match(world, /BLOCK_LABELS = new Map/)
  assert.match(world, /getBlockTiles\(b\)/)
  assert.match(world, /BLOCK_TEXTURE_INDEX_BY_ID/)
  assert.match(world, /BLOCK_META_BY_ID/)
  assert.equal(registry.blocks.length, 1285)
  assert.ok(registry.blocks.every((block) => typeof block.name === 'string' && typeof block.label === 'string'))
})

test('inventory UI renders the complete searchable item registry instead of a hard-coded block subset', async () => {
  const inventory = await read('Inventory.tsx')
  assert.match(inventory, /MINECRAFT_REGISTRY\.items\.map/)
  assert.match(inventory, /visibleItems\.map/)
  assert.match(inventory, /role="dialog"/)
  assert.match(inventory, /aria-modal="true"/)
  assert.match(inventory, /onGive/)
  assert.match(inventory, /bag\.map/)
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
  assert.match(world, /const OCC = new Uint8Array\(8192\)/)
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
  assert.ok(registry.items.some((item) => item.name === 'white_cushion'))
})

test('all 26.3 placeable block registry entries have stable internal IDs and 16-bit chunk storage', async () => {
  const world = await read('world.ts')
  assert.match(world, /import MINECRAFT_REGISTRY from '\.\/minecraft-26\.3-registry\.json'/)
  assert.match(world, /BLOCK_ID_BY_NAME/)
  assert.match(world, /EXTRA_BLOCK_ID_BASE/)
  assert.match(world, /new Uint16Array\(CS \* CS \* SY\)/)
  assert.match(world, /new Uint8Array\(8192\)/)
  assert.match(world, /MINECRAFT_REGISTRY\.blocks/)
  assert.match(world, /block\.box === 'block'/)
})

test('creative inventory browses the full item catalog with search and category filters', async () => {
  const inventory = await read('Inventory.tsx')
  assert.match(inventory, /MINECRAFT_REGISTRY\.items/)
  assert.match(inventory, /placeholder="搜索物品中文名称/)
  assert.match(inventory, /category/)
  assert.match(inventory, /全部/)
  assert.match(inventory, /1657|itemCount/)
  assert.match(inventory, /BLOCK_ID_BY_NAME/)
})


test('26.3 item and block registry IDs are unique and every block item maps to a placeable block', async () => {
  const registry = JSON.parse(await read('minecraft-26.3-registry.json'))
  const blockNames = new Set(registry.blocks.map((block) => block.name))
  const itemNames = new Set(registry.items.map((item) => item.name))
  const blockIds = new Set(registry.blocks.map((block) => block.id))
  const itemIds = new Set(registry.items.map((item) => item.id))
  assert.equal(blockNames.size, registry.blocks.length)
  assert.equal(itemNames.size, registry.items.length)
  assert.equal(blockIds.size, registry.blocks.length)
  assert.equal(itemIds.size, registry.items.length)
  assert.ok(registry.items.every((item) => Number.isInteger(item.id) && item.stack >= 1 && item.stack <= 64))
  assert.ok(registry.items.filter((item) => item.block).every((item) => blockNames.has(item.name)))
})

test('player storage saves a 27-slot bag and validates restored item stacks', async () => {
  const app = await read('App.tsx')
  const inventory = await read('Inventory.tsx')
  assert.match(app, /BAG_STORAGE_KEY = 'mc-web-inventory:v1'/)
  assert.match(app, /function readSavedInventory\(\)/)
  assert.match(app, /value\.length === 27/)
  assert.match(app, /window\.localStorage\.setItem\(BAG_STORAGE_KEY/)
  assert.match(app, /setBagSlots\(\(current\)/)
  assert.match(inventory, /玩家背包 · 27 格/)
  assert.match(inventory, /onRemove/)
})

test('existing legacy block IDs remain unchanged when the 26.3 registry is added', async () => {
  const world = await read('world.ts')
  for (const [name, id] of [['GRASS', 1], ['DIRT', 2], ['STONE', 3], ['SAND', 4], ['WATER', 5], ['LOG', 6], ['LEAVES', 7], ['PLANKS', 8], ['COBBLE', 9], ['GLASS', 10]]) {
    assert.match(world, new RegExp(`export const ${name} = ${id}`))
  }
  assert.match(world, /EXTRA_BLOCK_ID_BASE = 4096/)
})


test('every registered Minecraft 26.3 block has a Simplified Chinese display name', async () => {
  const registry = JSON.parse(await read('minecraft-26.3-registry.json'))
  const translations = JSON.parse(await read('minecraft-26.3-zh-cn.json'))
  for (const block of registry.blocks) {
    assert.equal(typeof translations[block.name], 'string', `missing Chinese name for ${block.name}`)
    assert.doesNotMatch(translations[block.name], /[A-Za-z]/, `English display name for ${block.name}`)
  }
  const inventory = await read('Inventory.tsx')
  assert.ok(inventory.includes('MINECRAFT_ZH_CN') && inventory.includes('[item.name]'))
})

test('all item catalog display names are Chinese and internal English IDs are not displayed', async () => {
  const registry = JSON.parse(await read('minecraft-26.3-registry.json'))
  const names = JSON.parse(await read('minecraft-26.3-zh-cn.json'))
  for (const item of registry.items) {
    assert.equal(typeof names[item.name], 'string', `missing item translation: ${item.name}`)
    assert.doesNotMatch(names[item.name], /[A-Za-z]/, `English item name: ${item.name}`)
  }
  const inventory = await read('Inventory.tsx')
  assert.ok(inventory.includes('物品编号 {selectedItem.id}'))
  assert.ok(!inventory.includes('{selectedItem.name} · 堆叠上限'))
})

test('every registered block gets a distinct three-face atlas tile in a 64 by 64 grid', async () => {
  const world = await read('world.ts')
  assert.ok(world.includes('const TILE_COUNT = 64'))
  assert.ok(world.includes('const base = 12 + index * 3'))
  assert.ok(world.includes('getBlockTiles(b)'))
  assert.ok(world.includes("new URL('vanilla-block-atlas.png', document.baseURI)"))
  assert.ok(world.includes('onAtlasReady'))
})

test('deployment fetches InventivetalentDev vanilla 26.3 textures and builds both block and item assets', async () => {
  const workflow = await read('.github/workflows/deploy.yml')
  assert.ok(workflow.includes('InventivetalentDev/minecraft-assets.git'))
  assert.ok(workflow.includes('assets/minecraft/textures'))
  assert.ok(workflow.includes('scripts/build_texture_atlas.py'))
  assert.ok(workflow.includes('pip install --disable-pip-version-check pillow'))
  assert.ok(workflow.includes('Build Vite application'))
})

test('core texture atlas fallbacks preserve recognizable block colors and PNG alpha', async () => {
  const builder = await read('scripts/build_texture_atlas.py')
  assert.match(builder, /def legacy_fallback\(key\)/)
  assert.match(builder, /"oak_leaves": \(\(55, 133, 55\), "leaves"\)/)
  assert.match(builder, /"grass_block_top": \(\(92, 150, 62\), "grass"\)/)
  assert.match(builder, /atlas\.paste\(image, \(\(index % GRID\) \* TILE, \(index \/\/ GRID\) \* TILE\)\)/)
  assert.doesNotMatch(builder, /atlas\.paste\(image, \(\(index % GRID\) \* TILE, \(index \/\/ GRID\) \* TILE\), image\)/)
  assert.doesNotMatch(builder, /atlas\.paste\(image, \(\(tile % GRID\) \* TILE, \(tile \/\/ GRID\) \* TILE\), image\)/)
})

test('inventory uses vanilla item PNGs instead of emoji or generated color placeholders', async () => {
  const inventory = await read('Inventory.tsx')
  assert.ok(inventory.includes('minecraft-item-textures/'))
  assert.ok(inventory.includes('<ItemTexture name={item.name}'))
  assert.ok(inventory.includes('onError={() => setFailed(true)}'))
  const builder = await read('scripts/build_texture_atlas.py')
  assert.ok(builder.includes('shutil.copytree(item_root, item_out)'))
  assert.ok(builder.includes('minecraft-item-textures'))
})

test('title screen uses ME WORLD branding and displays the requested Minecraft disclaimer', async () => {
  const logo = await read('Logo.tsx')
  const app = await read('App.tsx')
  assert.ok(logo.includes("const WORD = 'ME WORLD'"))
  assert.ok(app.includes('Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.'))
})
