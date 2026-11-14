import * as THREE from 'three'
import MINECRAFT_REGISTRY from './minecraft-26.3-registry.json'

export const SY = 64 // 世界高度(水平方向无限)
export const CS = 16 // 区块边长
export const SEA = 22

// 保留旧版 1–10 方块 ID，确保既有世界存档不会因升级而错位。
export const AIR = 0
export const GRASS = 1
export const DIRT = 2
export const STONE = 3
export const SAND = 4
export const WATER = 5
export const LOG = 6
export const LEAVES = 7
export const PLANKS = 8
export const COBBLE = 9
export const GLASS = 10

const LEGACY_BLOCK_IDS: Record<string, number> = {
  grass_block: GRASS, dirt: DIRT, stone: STONE, sand: SAND, water: WATER,
  oak_log: LOG, oak_leaves: LEAVES, oak_planks: PLANKS, cobblestone: COBBLE, glass: GLASS,
}
export const EXTRA_BLOCK_ID_BASE = 4096
export const BLOCK_ID_BY_NAME: Record<string, number> = Object.create(null)
export const BLOCK_META_BY_ID = new Map<number, (typeof MINECRAFT_REGISTRY.blocks)[number]>()
export const BLOCK_META_BY_NAME = new Map<string, (typeof MINECRAFT_REGISTRY.blocks)[number]>()
const BLOCK_TEXTURE_INDEX_BY_ID = new Map<number, number>()

for (const [blockIndex, block] of MINECRAFT_REGISTRY.blocks.entries()) {
  const id = LEGACY_BLOCK_IDS[block.name] ?? EXTRA_BLOCK_ID_BASE + block.id
  BLOCK_ID_BY_NAME[block.name] = id
  BLOCK_META_BY_ID.set(id, block)
  BLOCK_META_BY_NAME.set(block.name, block)
  BLOCK_TEXTURE_INDEX_BY_ID.set(id, blockIndex)
}
export const BLOCKS: number[] = [...new Set([...Object.values(LEGACY_BLOCK_IDS), ...MINECRAFT_REGISTRY.blocks.map((b) => BLOCK_ID_BY_NAME[b.name])])]
export const BLOCK_ID_SET = new Set<number>(BLOCKS)
export const BLOCK_LABELS = new Map<number, string>(MINECRAFT_REGISTRY.blocks.map((b): [number, string] => [BLOCK_ID_BY_NAME[b.name], b.label]))
export const HOTBAR = [GRASS, DIRT, STONE, COBBLE, PLANKS, LOG, SAND, GLASS, LEAVES]

const TILE = 16
const TILE_COUNT = Math.ceil(Math.sqrt(12 + MINECRAFT_REGISTRY.blocks.length * 3))

// [top, bottom, side]
const BLOCK_TILES: Record<number, [number, number, number]> = {
  [GRASS]: [0, 2, 1],
  [DIRT]: [2, 2, 2],
  [STONE]: [3, 3, 3],
  [SAND]: [4, 4, 4],
  [WATER]: [5, 5, 5],
  [LOG]: [7, 7, 6],
  [LEAVES]: [8, 8, 8],
  [PLANKS]: [9, 9, 9],
  [COBBLE]: [10, 10, 10],
  [GLASS]: [11, 11, 11],
}

function getBlockTiles(blockId: number): [number, number, number] {
  const legacy = BLOCK_TILES[blockId]
  if (legacy) return legacy
  const index = BLOCK_TEXTURE_INDEX_BY_ID.get(blockId)
  if (index === undefined) return [15, 15, 15]
  const base = 12 + index * 3
  return [base, base + 1, base + 2]
}

function getBlockTint(blockId: number): [number, number, number] {
  const meta = BLOCK_META_BY_ID.get(blockId)
  if (!meta) return [1, 1, 1]
  const name = meta.name
  const colors: Record<string, [number, number, number]> = {
    white: [1, 1, 1], orange: [1, 0.55, 0.2], magenta: [0.85, 0.35, 0.85],
    light_blue: [0.35, 0.7, 1], yellow: [1, 0.9, 0.25], lime: [0.55, 1, 0.2],
    pink: [1, 0.55, 0.7], gray: [0.55, 0.55, 0.55], light_gray: [0.8, 0.8, 0.8],
    cyan: [0.25, 0.8, 0.8], purple: [0.6, 0.3, 0.8], blue: [0.25, 0.35, 1],
    brown: [0.55, 0.35, 0.2], green: [0.3, 0.7, 0.25], red: [1, 0.25, 0.2], black: [0.22, 0.22, 0.22],
  }
  const prefix = name.split('_')[0]
  if (colors[prefix] && /wool|concrete|terracotta|cushion|stained_glass|carpet|banner|bed/.test(name)) return colors[prefix]
  if (/leaves|sapling|flower|grass|fern|moss|vine|shrub|mushroom/.test(name)) return [0.72, 1, 0.72]
  if (/log|wood|planks|sign|boat|bamboo|shelf|fence|door|trapdoor/.test(name)) return [1, 0.84, 0.62]
  if (/water|ice|snow|prismarine|diamond|lapis|copper/.test(name)) return [0.72, 0.9, 1]
  return [0.92, 0.92, 0.92]
}

// Blocks with full collision and blocks that occlude neighbouring faces.
const OCC = new Uint8Array(8192)
const SOLID = new Uint8Array(8192)
const TRANSPARENT = new Uint8Array(8192)
;[GRASS, DIRT, STONE, SAND, LOG, LEAVES, PLANKS, COBBLE, GLASS].forEach((b) => { OCC[b] = 1; SOLID[b] = 1 })
for (const block of MINECRAFT_REGISTRY.blocks) {
  const id = BLOCK_ID_BY_NAME[block.name]
  if (block.box === 'block') SOLID[id] = 1
  if (block.transparent) TRANSPARENT[id] = 1
  if (block.box === 'block' && !block.transparent) OCC[id] = 1
}

export function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash2(ix: number, iz: number, seed: number) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

export function valueNoise(x: number, z: number, seed: number, period = 0) {
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const fx = x - x0
  const fz = z - z0
  const sx = fx * fx * (3 - 2 * fx)
  const sz = fz * fz * (3 - 2 * fz)
  const w = (v: number) => (period ? ((v % period) + period) % period : v)
  const a = hash2(w(x0), w(z0), seed)
  const b = hash2(w(x0 + 1), w(z0), seed)
  const c = hash2(w(x0), w(z0 + 1), seed)
  const d = hash2(w(x0 + 1), w(z0 + 1), seed)
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz
}

function fbm(x: number, z: number, seed: number, oct = 4) {
  let amp = 0.5
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < oct; i++) {
    sum += valueNoise(x * freq, z * freq, seed + i * 101) * amp
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}

/* ------------------------------------------------------------------ */
/* Procedural texture atlas                                            */
/* ------------------------------------------------------------------ */

let atlasCanvas: HTMLCanvasElement | null = null

export function getAtlas() {
  if (atlasCanvas) return atlasCanvas
  const c = document.createElement('canvas')
  c.width = TILE * TILE_COUNT
  c.height = TILE * TILE_COUNT
  const ctx = c.getContext('2d')!
  const rnd = mulberry32(1234)
  const v = (amt: number) => (rnd() - 0.5) * 2 * amt

  const put = (tile: number, fn: (x: number, y: number) => [number, number, number, number]) => {
    const img = ctx.createImageData(TILE, TILE)
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const [r, g, b, a] = fn(x, y)
        const i = (y * TILE + x) * 4
        img.data[i] = r
        img.data[i + 1] = g
        img.data[i + 2] = b
        img.data[i + 3] = a
      }
    }
    ctx.putImageData(img, (tile % TILE_COUNT) * TILE, Math.floor(tile / TILE_COUNT) * TILE)
  }

  const grassPx = (): [number, number, number, number] => {
    const d = v(16)
    return [112 + d * 0.45, 145 + d * 0.75, 108 + d * 0.5, 255]
  }
  const dirtPx = (): [number, number, number, number] => {
    const r = rnd()
    let d = v(8)
    if (r < 0.14) d -= 22
    else if (r > 0.9) d += 16
    return [139 + d, 120 + d * 0.8, 103 + d * 0.6, 255]
  }

  // 0 grass top
  put(0, grassPx)
  // 1 grass side
  const depth = Array.from({ length: TILE }, () => 2 + Math.floor(rnd() * 3))
  put(1, (x, y) => (y < depth[x] ? grassPx() : dirtPx()))
  // 2 dirt
  put(2, dirtPx)
  // 3 stone
  put(3, () => {
    let d = v(9)
    if (rnd() < 0.1) d -= 22
    return [137 + d, 141 + d, 143 + d, 255]
  })
  // 4 sand
  put(4, () => {
    const d = v(7)
    return [207 + d, 199 + d, 178 + d, 255]
  })
  // 5 water
  put(5, () => {
    const d = v(10)
    return [93 + d * 0.35, 135 + d, 151 + d, 255]
  })
  // 6 log side
  const stripe = Array.from({ length: TILE }, () => v(16))
  put(6, (x) => {
    let s = stripe[x]
    if (rnd() < 0.06) s -= 20
    return [123 + s + v(5), 105 + s + v(4), 82 + s + v(3), 255]
  })
  // 7 log top
  put(7, (x, y) => {
    const dist = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5))
    if (dist > 7) return [116 + v(5), 98 + v(4), 77 + v(3), 255]
    const ring = Math.floor(dist) % 2
    return ring ? [151 + v(5), 129 + v(4), 101 + v(3), 255] : [177 + v(5), 153 + v(4), 119 + v(3), 255]
  })
  // 8 leaves
  put(8, () => {
    const r = rnd()
    if (r < 0.2) return [0, 0, 0, 0]
    let d = v(20)
    if (r > 0.8) d -= 28
    return [88 + d * 0.4, 126 + d, 88 + d * 0.5, 255]
  })
  // 9 planks
  const boardShade = [0, -10, 8, -5]
  const joint = Array.from({ length: 4 }, () => 2 + Math.floor(rnd() * 12))
  put(9, (x, y) => {
    const board = Math.floor(y / 4)
    if (y % 4 === 3) return [121, 105, 83, 255]
    if (x === joint[board]) return [139, 120, 94, 255]
    const d = boardShade[board] + v(5)
    return [164 + d, 143 + d, 112 + d, 255]
  })
  // 10 cobblestone
  const ids: number[] = new Array(TILE * TILE).fill(0)
  let id = 1
  for (let y = 0; y < TILE; ) {
    const h = 3 + Math.floor(rnd() * 3)
    let x = -Math.floor(rnd() * 3)
    while (x < TILE) {
      const w = 4 + Math.floor(rnd() * 3)
      for (let yy = y; yy < Math.min(TILE, y + h); yy++)
        for (let xx = Math.max(0, x); xx < Math.min(TILE, x + w); xx++) ids[yy * TILE + xx] = id
      id++
      x += w
    }
    y += h
  }
  const cellShade = Array.from({ length: id + 1 }, () => 100 + rnd() * 50)
  put(10, (x, y) => {
    const me = ids[y * TILE + x]
    const right = x + 1 < TILE ? ids[y * TILE + x + 1] : -1
    const below = y + 1 < TILE ? ids[(y + 1) * TILE + x] : -1
    let s = cellShade[me] + v(6)
    if (right !== me || below !== me) s *= 0.62
    return [s, s, s + 2, 255]
  })
  // 11 glass
  put(11, (x, y) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return [194, 216, 218, 255]
    if ((x === 3 && y === 3) || (x === 4 && y === 4) || (x === 3 && y === 5) || (x === 5 && y === 3))
      return [226, 237, 235, 255]
    return [0, 0, 0, 0]
  })
  // Generic procedural tiles used as visual fallbacks for the full 26.3 block registry.
  put(12, (x, y) => { const d = v(13); const grain = (x * 3 + y * 5) % 7 === 0 ? -18 : 0; return [132 + d + grain, 126 + d + grain, 119 + d + grain, 255] })
  put(13, (x) => { const d = v(8) + (x % 4 === 0 ? -12 : 0); return [151 + d, 111 + d * 0.7, 72 + d * 0.5, 255] })
  put(14, () => { const r = rnd(); if (r < 0.08) return [0, 0, 0, 0]; const d = v(18); return [70 + d * 0.45, 126 + d, 58 + d * 0.35, 255] })
  put(15, (x, y) => { const d = v(12); const seam = (x % 8 === 0 || y % 8 === 0) ? -14 : 0; return [142 + d + seam, 145 + d + seam, 151 + d + seam, 255] })

  // 每个注册方块都生成独立的备用像素纹理，官方/授权纹理图集加载后会整体替换。
  for (const [index, block] of MINECRAFT_REGISTRY.blocks.entries()) {
    const base = 12 + index * 3
    const tint = getBlockTint(BLOCK_ID_BY_NAME[block.name])
    let seed = 2166136261
    for (let i = 0; i < block.name.length; i++) seed = Math.imul(seed ^ block.name.charCodeAt(i), 16777619)
    const rand = (x: number, y: number, salt: number) => {
      let h = Math.imul((seed ^ salt ^ (x * 374761393) ^ (y * 668265263)) | 0, 1274126177)
      h ^= h >>> 16
      return (h >>> 0) / 4294967295
    }
    for (let face = 0; face < 3; face++) {
      put(base + face, (x, y) => {
        const grain = (rand(x, y, face * 977) - 0.5) * 38
        const seam = /planks|bricks|tiles|stairs|slab/.test(block.name) && (x % 8 === 0 || y % 8 === 0) ? -28 : 0
        const ore = /ore|diamond|emerald|amethyst|quartz|copper/.test(block.name) && rand(x, y, 73) > 0.91 ? 58 : 0
        const leaf = /leaves|moss|grass|fern|vine|shrub/.test(block.name) && rand(x, y, 51) < 0.12
        if (leaf) return [0, 0, 0, 0]
        const shade = face === 1 ? 0.78 : face === 2 ? 0.88 : 1
        return [
          Math.max(0, Math.min(255, (tint[0] * 205 + grain + seam + ore) * shade)),
          Math.max(0, Math.min(255, (tint[1] * 205 + grain + seam + ore) * shade)),
          Math.max(0, Math.min(255, (tint[2] * 205 + grain + seam + ore) * shade)),
          255,
        ]
      })
    }
  }

  atlasCanvas = c
  // 图集由构建工作流从带明确再分发许可的 26.3 资源包生成；本地开发无图集时保留独立备用纹理。
  if (!atlasLoadStarted) {
    atlasLoadStarted = true
    const atlasUrl = new URL('vanilla-block-atlas.png?v=20261114-texture-fix-3', document.baseURI).toString()
    fetch(atlasUrl)
      .then((response) => {
        const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
        if (!response.ok || !contentType.startsWith('image/')) return null
        return response.blob()
      })
      .then((blob) => {
        if (!blob) {
          atlasLoadStarted = false
          return
        }
        const image = new Image()
        image.onload = () => {
          const context = c.getContext('2d')
          if (!context) return
          context.clearRect(0, 0, c.width, c.height)
          context.drawImage(image, 0, 0, c.width, c.height)
          URL.revokeObjectURL(image.src)
          atlasLoaded = true
          if (atlasTex) atlasTex.needsUpdate = true
          iconCache.clear()
          atlasReadyListeners.forEach((listener) => listener())
        }
        image.onerror = () => {
          URL.revokeObjectURL(image.src)
          atlasLoadStarted = false
        }
        image.src = URL.createObjectURL(blob)
      })
      .catch(() => { atlasLoadStarted = false })
  }
  return c
}

let atlasTex: THREE.CanvasTexture | null = null
let atlasLoaded = false
let atlasLoadStarted = false
const atlasReadyListeners = new Set<() => void>()
const iconCache = new Map<number, string>()
export function onAtlasReady(listener: () => void) {
  atlasReadyListeners.add(listener)
  if (atlasLoaded) listener()
  return () => { atlasReadyListeners.delete(listener) }
}
export function getAtlasTexture() {
  if (atlasTex) return atlasTex
  const t = new THREE.CanvasTexture(getAtlas())
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  t.generateMipmaps = false
  t.colorSpace = THREE.SRGBColorSpace
  atlasTex = t
  return t
}

export function blockIcon(b: number) {
  const hit = iconCache.get(b)
  if (hit) return hit
  const atlas = getAtlas()
  const c = document.createElement('canvas')
  c.width = 48
  c.height = 48
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  const [top, , side] = getBlockTiles(b)
  const draw = (tile: number, m: [number, number, number, number, number, number], shade: number) => {
    ctx.save()
    ctx.setTransform(...m)
    ctx.drawImage(atlas, (tile % TILE_COUNT) * TILE, Math.floor(tile / TILE_COUNT) * TILE, TILE, TILE, 0, 0, TILE, TILE)
    if (shade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${shade})`
      ctx.fillRect(0, 0, TILE, TILE)
    }
    ctx.restore()
  }
  draw(top, [1.25, 0.625, -1.25, 0.625, 24, 4], 0)
  draw(side, [1.25, 0.625, 0, 1.25, 4, 14], 0.28)
  draw(side, [1.25, -0.625, 0, 1.25, 24, 24], 0.5)
  const url = c.toDataURL()
  iconCache.set(b, url)
  return url
}

let dirtUrl = ''
export function dirtDataURL() {
  if (dirtUrl) return dirtUrl
  const atlas = getAtlas()
  const c = document.createElement('canvas')
  c.width = TILE
  c.height = TILE
  c.getContext('2d')!.drawImage(atlas, 2 * TILE, 0, TILE, TILE, 0, 0, TILE, TILE)
  dirtUrl = c.toDataURL()
  return dirtUrl
}
/* ------------------------------------------------------------------ */
/* World:无限世界,按 16×16 区块即时生成                                   */
/* ------------------------------------------------------------------ */

const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.7, ti: 2 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.7, ti: 2 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1, ti: 0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5, ti: 1 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.85, ti: 2 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.85, ti: 2 },
]

const AO_B = [0.5, 0.68, 0.84, 1]

class MeshData {
  pos: number[] = []
  uv: number[] = []
  col: number[] = []
  idx: number[] = []
  toGeometry() {
    if (this.idx.length === 0) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setIndex(new THREE.Uint32BufferAttribute(this.idx, 1))
    g.computeVertexNormals()
    g.computeBoundingSphere()
    return g
  }
}

/** 区块坐标 -> 数字键(支持 ±32768 个区块,约 ±52 万格) */
export function ckey(cx: number, cz: number) {
  return ((cx & 0xffff) << 16) | (cz & 0xffff)
}

function hash3(x: number, y: number, z: number, seed: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ Math.imul(seed, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function combineFaceGeometry(parts: MeshData[]) {
  const geometry = new THREE.BufferGeometry()
  const positions: number[] = []
  const uvs: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  parts.forEach((part, materialIndex) => {
    if (part.idx.length === 0) return
    const vertexOffset = positions.length / 3
    const indexStart = indices.length
    positions.push(...part.pos)
    uvs.push(...part.uv)
    colors.push(...part.col)
    indices.push(...part.idx.map((index) => index + vertexOffset))
    geometry.addGroup(indexStart, part.idx.length, materialIndex)
  })
  if (indices.length === 0) return null
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(new THREE.Uint32BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

export class Chunk {
  data = new Uint16Array(CS * CS * SY)
  /** 本区块内最高的非空气方块高度,网格化时只扫到这一层 */
  maxY = 0
  /** 本区块被玩家修改过的体素索引及最终方块 ID,用于本机存档 */
  overrides = new Map<number, number>()
  /** 被玩家改过的区块:永远不会被回收,否则改动会丢失 */
  modified = false
  constructor(
    public cx: number,
    public cz: number,
  ) {}
}

const TREE_MARGIN = 2
const WORLD_SAVE_PREFIX = 'mc-web-world:v1:'

export class World {
  chunks = new Map<number, Chunk>()
  panorama = { x: 0, y: 40, z: 0 }
  private seed: number
  private last: Chunk | null = null
  private storage: Storage | null

  constructor(seed = 7, storage?: Storage | null) {
    this.seed = seed
    this.storage = storage === undefined ? this.resolveStorage() : storage
    this.panorama = this.findPanoramaSpot()
  }

  private resolveStorage(): Storage | null {
    try {
      return typeof window !== 'undefined' ? window.localStorage : null
    } catch {
      return null
    }
  }

  private storageKey(cx: number, cz: number) {
    return `${WORLD_SAVE_PREFIX}${this.seed}:${cx}:${cz}`
  }

  private restoreChunk(chunk: Chunk) {
    if (!this.storage) return
    const key = this.storageKey(chunk.cx, chunk.cz)
    try {
      const raw = this.storage.getItem(key)
      if (!raw) return
      const saved = JSON.parse(raw) as { version?: unknown; edits?: unknown }
      if (saved.version !== 1 || !Array.isArray(saved.edits)) return

      let maxY = chunk.maxY
      for (const edit of saved.edits) {
        if (!Array.isArray(edit) || edit.length !== 2) continue
        const [index, block] = edit
        if (!Number.isInteger(index) || index < 0 || index >= chunk.data.length) continue
        if (!Number.isInteger(block) || (block !== AIR && !BLOCK_ID_SET.has(block))) continue
        chunk.data[index] = block
        chunk.overrides.set(index, block)
        if (block !== AIR) maxY = Math.max(maxY, Math.floor(index / (CS * CS)))
      }
      chunk.maxY = maxY
      chunk.modified = chunk.overrides.size > 0
    } catch {
      // 损坏的存档不能阻止世界加载；删除损坏的当前区块存档。
      try { this.storage.removeItem(key) } catch { /* 忽略不可用的存储 */ }
    }
  }

  private persistChunk(chunk: Chunk): boolean {
    if (!this.storage) return false
    const key = this.storageKey(chunk.cx, chunk.cz)
    try {
      if (chunk.overrides.size === 0) this.storage.removeItem(key)
      else this.storage.setItem(key, JSON.stringify({ version: 1, edits: [...chunk.overrides] }))
      return true
    } catch {
      // 配额已满或浏览器禁用本地存储时，游戏仍可继续，但退出前会报告保存失败。
      return false
    }
  }

  save(): boolean {
    if (!this.storage) return false
    for (const chunk of this.chunks.values()) {
      if (chunk.modified && !this.persistChunk(chunk)) return false
    }
    return true
  }

  /* ------------------------------ 地形函数 ------------------------------ */

  /** 任意 (x,z) 的地表高度,纯函数,所以世界可以无限延伸 */
  heightAt(x: number, z: number) {
    const m = (fbm(x / 46, z / 46, this.seed) - 0.5) * 2
    let h = 25 + m * 15 + Math.max(0, m - 0.12) * 42
    h += (fbm(x / 7, z / 7, this.seed + 50, 2) - 0.5) * 3.5
    return Math.max(3, Math.min(SY - 10, Math.floor(h)))
  }

  /** 该列是否长树,返回树干高度(0 = 没树)。同样是纯函数,跨区块的树因此能完整拼合 */
  private treeAt(x: number, z: number, h: number) {
    if (h <= SEA + 1 || h >= 43) return 0
    if (hash2(x, z, this.seed + 9) > 0.011) return 0
    return 4 + Math.floor(hash2(x, z, this.seed + 10) * 2)
  }

  private generateChunk(cx: number, cz: number) {
    const ch = new Chunk(cx, cz)
    const x0 = cx * CS
    const z0 = cz * CS
    const M = TREE_MARGIN
    const W = CS + M * 2
    const hs = new Int16Array(W * W)
    for (let lz = 0; lz < W; lz++) for (let lx = 0; lx < W; lx++) hs[lz * W + lx] = this.heightAt(x0 - M + lx, z0 - M + lz)

    let maxY = 0
    const d = ch.data
    for (let z = 0; z < CS; z++) {
      for (let x = 0; x < CS; x++) {
        const h = hs[(z + M) * W + x + M]
        const sandy = h <= SEA + 1
        const rocky = h >= 43
        for (let y = 0; y <= h; y++) {
          let b = STONE
          if (y === h) b = sandy ? SAND : rocky ? STONE : GRASS
          else if (y >= h - 3 && !rocky) b = sandy ? SAND : DIRT
          d[(y * CS + z) * CS + x] = b
        }
        for (let y = h + 1; y <= SEA; y++) d[(y * CS + z) * CS + x] = WATER
        maxY = Math.max(maxY, h, h < SEA ? SEA : 0)
      }
    }

    // 树:检查区块外 2 格内的树根,把落进本区块的树干、树叶补上
    const trees: number[][] = []
    for (let lz = 0; lz < W; lz++) {
      for (let lx = 0; lx < W; lx++) {
        const h = hs[lz * W + lx]
        const th = this.treeAt(x0 - M + lx, z0 - M + lz, h)
        if (th) trees.push([x0 - M + lx, z0 - M + lz, h, th])
      }
    }
    const put = (wx: number, y: number, wz: number, b: number, onlyAir: boolean) => {
      const lx = wx - x0
      const lz = wz - z0
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || y < 0 || y >= SY) return
      const i = (y * CS + lz) * CS + lx
      if (onlyAir && d[i] !== AIR) return
      d[i] = b
      if (y > maxY) maxY = y
    }
    for (const [x, z, h, th] of trees) for (let y = 1; y <= th; y++) put(x, h + y, z, LOG, false)
    for (const [x, z, h, th] of trees) {
      const top = h + th
      for (let dy = -2; dy <= 1; dy++) {
        const r = dy <= -1 ? 2 : 1
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) === r && Math.abs(dz) === r && (dy >= 0 || hash3(x + dx, top + dy, z + dz, this.seed + 11) < 0.45)) continue
            put(x + dx, top + dy, z + dz, LEAVES, true)
          }
        }
      }
    }
    ch.maxY = maxY
    return ch
  }

  /* ------------------------------ 区块存取 ------------------------------ */

  getChunk(cx: number, cz: number) {
    const k = ckey(cx, cz)
    let c = this.chunks.get(k)
    if (!c) {
      c = this.generateChunk(cx, cz)
      this.restoreChunk(c)
      this.chunks.set(k, c)
    }
    return c
  }

  /** 回收离玩家最远、且没被改过的区块数据,控制内存 */
  trim(pcx: number, pcz: number, max: number) {
    if (this.chunks.size <= max) return
    const arr: [number, number][] = []
    this.chunks.forEach((c, k) => {
      if (!c.modified) arr.push([(c.cx - pcx) ** 2 + (c.cz - pcz) ** 2, k])
    })
    arr.sort((a, b) => b[0] - a[0])
    let n = this.chunks.size - Math.floor(max * 0.75)
    for (let i = 0; i < arr.length && n > 0; i++, n--) this.chunks.delete(arr[i][1])
    this.last = null
  }

  get(x: number, y: number, z: number) {
    if (y < 0) return STONE
    if (y >= SY) return AIR
    const cx = x >> 4
    const cz = z >> 4
    let c = this.last
    if (!c || c.cx !== cx || c.cz !== cz) {
      c = this.getChunk(cx, cz)
      this.last = c
    }
    return c.data[(y * CS + (z & 15)) * CS + (x & 15)]
  }

  set(x: number, y: number, z: number, b: number) {
    if (y < 0 || y >= SY) return
    if (!Number.isInteger(b) || (b !== AIR && !BLOCK_ID_SET.has(b))) return
    const c = this.getChunk(x >> 4, z >> 4)
    const index = (y * CS + (z & 15)) * CS + (x & 15)
    c.data[index] = b
    c.overrides.set(index, b)
    c.modified = true
    if (b !== AIR && y > c.maxY) c.maxY = y
    this.persistChunk(c)
  }

  isSolid(x: number, y: number, z: number) {
    if (y < 0) return true
    if (y >= SY) return false
    const b = this.get(x, y, z)
    return SOLID[b] === 1
  }

  /* ------------------------------ 出生点 / 全景 ------------------------------ */

  private findPanoramaSpot() {
    let best = { x: 0.5, y: 40, z: 0.5 }
    let bestScore = -Infinity
    const hAt = (x: number, z: number) => Math.max(SEA, this.heightAt(Math.floor(x), Math.floor(z)))
    for (let z = -96; z <= 96; z += 6) {
      for (let x = -96; x <= 96; x += 6) {
        const ch = this.heightAt(x, z)
        if (ch < SEA + 1 || ch > SEA + 9) continue
        const samples: number[] = []
        let blocked = 0
        let water = 0
        for (const r of [10, 22, 38]) {
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2
            const sx = x + Math.cos(a) * r
            const sz = z + Math.sin(a) * r
            const hh = hAt(sx, sz)
            samples.push(hh)
            if (r === 10 && hh > ch + 9) blocked++
            if (this.heightAt(Math.floor(sx), Math.floor(sz)) < SEA) water++
          }
        }
        const mean = samples.reduce((a, b) => a + b, 0) / samples.length
        const sd = Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length)
        const waterFrac = water / samples.length
        const score = sd * 1.5 + Math.min(waterFrac, 0.35) * 25 - blocked * 8
        if (score > bestScore) {
          bestScore = score
          best = { x: x + 0.5, y: Math.max(ch, SEA) + 6, z: z + 0.5 }
        }
      }
    }
    return best
  }

  findSpawn() {
    for (let r = 0; r < 160; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
          const h = this.heightAt(dx, dz)
          if (h <= SEA + 1 || h >= 43) continue
          for (let y = SY - 1; y >= 0; y--) {
            const b = this.get(dx, y, dz)
            if (b === AIR) continue
            if (b === GRASS) return { x: dx + 0.5, y: y + 1, z: dz + 0.5 }
            break
          }
        }
      }
    }
    return { x: 0.5, y: SY - 1, z: 0.5 }
  }

  /* ------------------------------ 网格化 ------------------------------ */

  private occAt(x: number, y: number, z: number) {
    return OCC[this.get(x, y, z)]
  }

  private ao(px: number, py: number, pz: number, a1: number, a2: number, s1: number, s2: number) {
    const d1 = [0, 0, 0]
    const d2 = [0, 0, 0]
    d1[a1] = s1
    d2[a2] = s2
    const e1 = this.occAt(px + d1[0], py + d1[1], pz + d1[2])
    const e2 = this.occAt(px + d2[0], py + d2[1], pz + d2[2])
    const cn = this.occAt(px + d1[0] + d2[0], py + d1[1] + d2[1], pz + d1[2] + d2[2])
    return e1 && e2 ? 0 : 3 - (e1 + e2 + cn)
  }

  buildChunk(cx: number, cz: number) {
    const water = new MeshData()
    const opaqueByBlock = new Map<number, MeshData[]>()
    const ch = this.getChunk(cx, cz)
    const x0 = cx * CS
    const z0 = cz * CS
    const aoV = [3, 3, 3, 3]
    const faceIndexByNormal = [0, 1, 2, 3, 4, 5]

    for (let y = 0; y <= ch.maxY; y++) {
      for (let z = z0; z < z0 + CS; z++) {
        for (let x = x0; x < x0 + CS; x++) {
          const b = ch.data[(y * CS + (z - z0)) * CS + (x - x0)]
          if (!b) continue
          const isWater = b === WATER
          const tiles = getBlockTiles(b)
          let blockFaces = isWater ? null : opaqueByBlock.get(b)
          if (!isWater && !blockFaces) {
            blockFaces = Array.from({ length: 6 }, () => new MeshData())
            opaqueByBlock.set(b, blockFaces)
          }
          for (let faceIndex = 0; faceIndex < FACES.length; faceIndex++) {
            const f = FACES[faceIndex]
            const nb = this.get(x + f.n[0], y + f.n[1], z + f.n[2])
            if (isWater) {
              if (nb !== AIR) continue
            } else if (TRANSPARENT[b]) {
              if (nb === b || OCC[nb]) continue
            } else if (OCC[nb]) continue

            const md = isWater ? water : blockFaces![faceIndex]
            const tile = tiles[f.ti]
            const tileX = tile % TILE_COUNT
            const tileY = Math.floor(tile / TILE_COUNT)
            const u0 = tileX / TILE_COUNT
            const u1 = (tileX + 1) / TILE_COUNT
            const v0 = 1 - (tileY + 1) / TILE_COUNT
            const v1 = 1 - tileY / TILE_COUNT
            const base = md.pos.length / 3
            const ax = f.n[0] !== 0 ? 0 : f.n[1] !== 0 ? 1 : 2
            const a1 = (ax + 1) % 3
            const a2 = (ax + 2) % 3
            const useAO = !isWater && b !== GLASS
            const topH = isWater && this.get(x, y + 1, z) !== WATER ? 0.9 : 1
            for (let i = 0; i < 4; i++) {
              const corner = f.c[i]
              md.pos.push(x + corner[0], y + (corner[1] ? topH : 0), z + corner[2])
              // Independent face images use the full 0..1 UV range.
              md.uv.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0)
              let brightness = f.shade
              if (useAO) {
                const ao = this.ao(x + f.n[0], y + f.n[1], z + f.n[2], a1, a2, corner[a1] * 2 - 1, corner[a2] * 2 - 1)
                aoV[i] = ao
                brightness *= AO_B[ao]
              }
              const tint = getBlockTint(b)
              md.col.push(brightness * tint[0], brightness * tint[1], brightness * tint[2])
            }
            if (useAO && aoV[0] + aoV[2] < aoV[1] + aoV[3]) {
              md.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base)
            } else {
              md.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
            }
          }
        }
      }
    }
    const opaque = [...opaqueByBlock.entries()].flatMap(([blockId, faces]) => {
      const geometry = combineFaceGeometry(faces)
      return geometry ? [{ blockId, geometry }] : []
    })
    return { opaque, water: water.toGeometry() }
  }}

let world: World | null = null
export function getWorld() {
  if (!world) world = new World()
  return world
}
