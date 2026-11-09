import { useEffect, useMemo, useState } from 'react'
import MINECRAFT_REGISTRY from './minecraft-26.3-registry.json'
import MINECRAFT_ZH_CN from './minecraft-26.3-zh-cn.json'
import { BLOCK_ID_BY_NAME, BLOCK_META_BY_NAME, blockIcon, onAtlasReady } from './world'

export type InventoryStack = { itemId: number; count: number } | null

type CatalogItem = (typeof MINECRAFT_REGISTRY.items)[number]
type Category = '全部' | '建筑方块' | '自然方块' | '功能方块' | '红石' | '装备' | '食物' | '材料' | '杂项'

type Props = {
  selected: number
  hotbar: number[]
  bag: InventoryStack[]
  onEquip: (blockId: number, targetSlot?: number) => void
  onSelect: (slot: number) => void
  onGive: (itemId: number, count: number) => void
  onRemove: (slot: number) => void
  onClose: () => void
}

const CATEGORIES: Category[] = ['全部', '建筑方块', '自然方块', '功能方块', '红石', '装备', '食物', '材料', '杂项']

const CN_NAMES: Record<string, string> = {
  grass_block: '草方块', dirt: '泥土', stone: '石头', sand: '沙子', water: '水',
  oak_log: '橡木原木', oak_leaves: '橡树树叶', oak_planks: '橡木木板', cobblestone: '圆石', glass: '玻璃',
  poplar_log: '白杨原木', stripped_poplar_log: '去皮白杨原木', poplar_wood: '白杨木', stripped_poplar_wood: '去皮白杨木',
  poplar_planks: '白杨木板', poplar_sapling: '白杨树苗', red_poplar_leaves: '红色白杨树叶',
  orange_poplar_leaves: '橙色白杨树叶', yellow_poplar_leaves: '黄色白杨树叶', poplar_slab: '白杨台阶',
  poplar_shelf: '白杨木架', poplar_fence: '白杨栅栏', poplar_stairs: '白杨楼梯', poplar_button: '白杨按钮',
  poplar_pressure_plate: '白杨压力板', poplar_door: '白杨门', poplar_trapdoor: '白杨活板门',
  poplar_fence_gate: '白杨栅栏门', poplar_boat: '白杨木船', poplar_chest_boat: '白杨运输船',
  poplar_sign: '白杨木告示牌', poplar_hanging_sign: '白杨木悬挂告示牌',
  shelf_mushroom: '架状蘑菇', red_shrub: '红色灌木', straw_bed: '稻草床',
  abandoned_camp_map: '废弃营地地图', white_cushion: '白色坐垫', orange_cushion: '橙色坐垫',
  magenta_cushion: '品红色坐垫', light_blue_cushion: '淡蓝色坐垫', yellow_cushion: '黄色坐垫',
  lime_cushion: '黄绿色坐垫', pink_cushion: '粉色坐垫', gray_cushion: '灰色坐垫',
  light_gray_cushion: '淡灰色坐垫', cyan_cushion: '青色坐垫', purple_cushion: '紫色坐垫',
  blue_cushion: '蓝色坐垫', brown_cushion: '棕色坐垫', green_cushion: '绿色坐垫',
  red_cushion: '红色坐垫', black_cushion: '黑色坐垫',
  diamond: '钻石', diamond_sword: '钻石剑', diamond_pickaxe: '钻石镐', diamond_axe: '钻石斧',
  diamond_shovel: '钻石锹', diamond_hoe: '钻石锄', iron_ingot: '铁锭', gold_ingot: '金锭',
  copper_ingot: '铜锭', netherite_ingot: '下界合金锭', emerald: '绿宝石', redstone: '红石粉',
  lapis_lazuli: '青金石', coal: '煤炭', stick: '木棍', apple: '苹果', golden_apple: '金苹果',
  bread: '面包', cooked_beef: '熟牛肉', beef: '生牛肉', carrot: '胡萝卜', potato: '马铃薯',
  torch: '火把', crafting_table: '工作台', furnace: '熔炉', chest: '箱子', barrel: '木桶',
  bow: '弓', crossbow: '弩', trident: '三叉戟', shield: '盾牌', elytra: '鞘翅',
  water_bucket: '水桶', lava_bucket: '熔岩桶', bucket: '桶', compass: '指南针', clock: '时钟',
  paper: '纸', book: '书', map: '地图', arrow: '箭', snowball: '雪球', egg: '鸡蛋',
  ender_pearl: '末影珍珠', experience_bottle: '附魔之瓶', potion: '药水',
}

const REDSTONE_RE = /redstone|piston|repeater|comparator|observer|dispenser|dropper|hopper|lever|pressure_plate|tripwire|daylight_detector|sculk_sensor|crafter|rail|tnt|target|redstone_torch|lightning_rod/
const FUNCTIONAL_RE = /crafting_table|furnace|smoker|blast_furnace|chest|barrel|shulker_box|anvil|enchanting_table|brewing_stand|beacon|lectern|loom|cartography_table|smithing_table|stonecutter|grindstone|bell|jukebox|note_block|respawn_anchor|bed|door|trapdoor|sign|shelf/
const NATURAL_RE = /stone|dirt|grass|sand|gravel|ore|log|wood|leaves|sapling|flower|mushroom|coral|ice|snow|water|lava|clay|moss|root|cactus|sugar_cane|kelp|seagrass|shrub|petal|vine/
const EQUIPMENT_RE = /sword|pickaxe|axe|shovel|hoe|helmet|chestplate|leggings|boots|bow|crossbow|trident|shield|elytra|fishing_rod|shears|flint_and_steel|brush|spyglass|mace|spear/
const MATERIAL_RE = /ingot|nugget|raw_|gem|diamond|emerald|coal|quartz|amethyst|lapis|redstone|string|leather|feather|bone|stick|flint|powder|shard|fragment|disc|music_disc|banner_pattern|pottery_sherd/

function categoryOf(item: CatalogItem): Category {
  const name = item.name
  if (item.food) return '食物'
  if (REDSTONE_RE.test(name)) return '红石'
  if (item.block) {
    const meta = BLOCK_META_BY_NAME.get(name)
    if (FUNCTIONAL_RE.test(name)) return '功能方块'
    if (NATURAL_RE.test(name) || meta?.material?.includes('shovel') || meta?.material?.includes('leaves')) return '自然方块'
    return '建筑方块'
  }
  if (EQUIPMENT_RE.test(name)) return '装备'
  if (MATERIAL_RE.test(name)) return '材料'
  return '杂项'
}

function itemName(item: CatalogItem) {
  return (MINECRAFT_ZH_CN as Record<string, string>)[item.name] || CN_NAMES[item.name] || item.label
}

function itemGlyph(name: string) {
  if (/sword|trident|mace|spear/.test(name)) return '⚔'
  if (/pickaxe|axe|shovel|hoe/.test(name)) return '⛏'
  if (/helmet|chestplate|leggings|boots|shield/.test(name)) return '🛡'
  if (/apple|bread|beef|porkchop|chicken|carrot|potato|stew|cookie|pie|fish|melon/.test(name)) return '🍎'
  if (/potion|bottle/.test(name)) return '🧪'
  if (/spawn_egg/.test(name)) return '🥚'
  if (/boat|minecart/.test(name)) return '🛶'
  if (/map|compass|clock|spyglass/.test(name)) return '🧭'
  if (/book|paper/.test(name)) return '📖'
  if (/music_disc/.test(name)) return '🎵'
  if (/bow|crossbow|arrow/.test(name)) return '🏹'
  if (/diamond|emerald|amethyst|quartz|gem/.test(name)) return '💎'
  if (/bucket/.test(name)) return '🪣'
  return name.slice(0, 2).toUpperCase()
}

function itemColor(name: string) {
  let hash = 2166136261
  for (let i = 0; i < name.length; i++) hash = Math.imul(hash ^ name.charCodeAt(i), 16777619)
  const hue = (hash >>> 0) % 360
  return `hsl(${hue} 38% 42%)`
}

export default function Inventory({ selected, hotbar, bag, onEquip, onSelect, onGive, onRemove, onClose }: Props) {
  const [category, setCategory] = useState<Category>('全部')
  const [query, setQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null)
  const [, setAtlasVersion] = useState(0)
  useEffect(() => onAtlasReady(() => setAtlasVersion((version) => version + 1)), [])
  const categorized = useMemo(() => MINECRAFT_REGISTRY.items.map((item) => ({ item, category: categoryOf(item) })), [])
  const visibleItems = useMemo(() => {
    const q = query.trim().toLocaleLowerCase()
    return categorized.filter(({ item, category: itemCategory }) => {
      if (category !== '全部' && category !== itemCategory) return false
      return !q || item.name.includes(q) || item.label.toLocaleLowerCase().includes(q) || itemName(item).toLocaleLowerCase().includes(q)
    })
  }, [categorized, category, query])
  const selectedBlockId = selectedItem ? BLOCK_ID_BY_NAME[selectedItem.name] : undefined

  return (
    <div className="inventory-overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section className="inventory-panel w-[min(900px,98vw)] border-4 border-[#242424] bg-[#c6c6c6] p-3 text-[#202020] shadow-[0_8px_32px_#0009]" role="dialog" aria-modal="true" aria-labelledby="inventory-title">
        <header className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 id="inventory-title" className="font-bold text-lg">物品栏 · 完整物品目录</h2>
            <div className="text-[11px] text-[#555]">我的世界 Java 版 26.3 · {MINECRAFT_REGISTRY.itemCount} 种物品 · {MINECRAFT_REGISTRY.blockCount} 种方块</div>
          </div>
          <button className="min-h-10 border-2 border-[#333] bg-[#8b8b8b] px-3 py-1 text-white" onClick={onClose}>关闭 ×</button>
        </header>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索物品中文名称或编号..." aria-label="搜索物品" className="min-w-0 flex-1 border-2 border-[#555] bg-white px-3 py-2 text-sm text-black outline-none focus:border-[#315f9c]" />
          <span className="whitespace-nowrap text-xs text-[#444]">{visibleItems.length} / {MINECRAFT_REGISTRY.itemCount}</span>
        </div>

        <nav className="mb-3 flex gap-1 overflow-x-auto pb-1" aria-label="物品分类">
          {CATEGORIES.map((name) => (
            <button key={name} onClick={() => setCategory(name)} aria-pressed={category === name}
              className={`shrink-0 border-2 px-3 py-1.5 text-xs font-semibold ${category === name ? 'border-[#243e60] bg-[#4776a8] text-white' : 'border-[#666] bg-[#aaa] text-[#222]'}`}>
              {name}
            </button>
          ))}
        </nav>

        <div className="grid max-h-[34vh] grid-cols-5 gap-1 overflow-y-auto border-2 border-[#555] bg-[#777] p-1 [@media(min-width:560px)]:grid-cols-7 [@media(min-width:760px)]:grid-cols-9">
          {visibleItems.map(({ item }) => {
            const blockId = BLOCK_ID_BY_NAME[item.name]
            const isSelected = selectedItem?.id === item.id
            return (
              <button key={item.id} onClick={() => { setSelectedItem(item); if (blockId !== undefined) onGive(item.id, item.stack) }}
                title={itemName(item)} aria-label={itemName(item)}
                className={`flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1 border-2 p-1 ${isSelected ? 'border-white bg-[#557b9d]' : 'border-[#555] bg-[#999] hover:bg-[#b2b2b2]'}`}>
                {blockId !== undefined ? (
                  <img src={blockIcon(blockId)} alt="" className="h-8 w-8 object-contain" style={{ imageRendering: 'pixelated' }} />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center border border-black/40 text-[17px] font-bold text-white shadow-inner" style={{ background: itemColor(item.name), textShadow: '1px 1px 1px #000' }}>{itemGlyph(item.name)}</span>
                )}
                <span className="w-full truncate text-center text-[10px] leading-tight text-[#171717]">{itemName(item)}</span>
              </button>
            )
          })}
          {visibleItems.length === 0 && <div className="col-span-full p-6 text-center text-sm text-white">没有找到匹配的物品</div>}
        </div>

        {selectedItem && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-2 border-[#777] bg-[#b4b4b4] px-2 py-2">
            <div className="min-w-0 text-xs">
              <strong className="block truncate">{itemName(selectedItem)}</strong>
              <span className="text-[#555]">物品编号 {selectedItem.id} · 堆叠上限 {selectedItem.stack}</span>
            </div>
            <div className="flex gap-2">
              {selectedBlockId !== undefined && <button onClick={() => onEquip(selectedBlockId)} className="min-h-9 border-2 border-[#333] bg-[#4776a8] px-3 text-xs font-bold text-white">放入快捷栏</button>}
              <button onClick={() => onGive(selectedItem.id, selectedItem.stack)} className="min-h-9 border-2 border-[#333] bg-[#5b8751] px-3 text-xs font-bold text-white">再获取一组</button>
            </div>
          </div>
        )}

        <div className="mt-3 mb-1 flex items-center justify-between">
          <strong className="text-sm">玩家背包 · 27 格</strong>
          <span className="text-[11px] text-[#555]">点击方块可快捷装备；点击其他物品可移除整组</span>
        </div>
        <div className="grid grid-cols-9 gap-1">
          {bag.map((stack, i) => {
            const item = stack ? MINECRAFT_REGISTRY.items.find((entry) => entry.id === stack.itemId) : undefined
            const blockId = item ? BLOCK_ID_BY_NAME[item.name] : undefined
            return (
              <button key={i} onClick={() => { if (stack && blockId !== undefined) onEquip(blockId); else if (stack) onRemove(i) }}
                title={stack && item ? `${itemName(item)} × ${stack.count}` : `背包空格 ${i + 1}`}
                aria-label={stack && item ? `${itemName(item)}，数量 ${stack.count}` : `背包空格 ${i + 1}`}
                className="relative aspect-square min-w-0 border-2 border-[#555] bg-[#8b8b8b] p-1 shadow-[inset_2px_2px_0_#eee,inset_-2px_-2px_0_#444]">
                {stack && item && (blockId !== undefined
                  ? <img src={blockIcon(blockId)} alt="" className="h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
                  : <span className="flex h-full w-full items-center justify-center text-lg">{itemGlyph(item.name)}</span>)}
                {stack && <span className="absolute right-0 bottom-0 rounded-sm bg-black/75 px-1 text-[10px] font-bold text-white">{stack.count}</span>}
              </button>
            )
          })}
        </div>

        <div className="mt-3 mb-1 text-sm font-bold">快捷栏 · 选择一个位置，再从物品栏放入方块</div>
        <div className="grid grid-cols-9 gap-1">
          {hotbar.map((id, i) => (
            <button key={i} onClick={() => onSelect(i)} aria-label={`快捷栏第 ${i + 1} 格`} className="relative aspect-square min-w-0 border-2 border-[#555] bg-[#8b8b8b] p-1 shadow-[inset_2px_2px_0_#eee,inset_-2px_-2px_0_#444]"
              style={i === selected ? { outline: '3px solid white', outlineOffset: '-3px' } : undefined}>
              <img src={blockIcon(id)} alt="" className="h-full w-full" style={{ imageRendering: 'pixelated' }} />
              <span className="absolute top-0 left-1 text-[9px] text-white">{i + 1}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-center text-[11px] text-[#444]">点击物品获取一组 · 方块可放入快捷栏 · 非方块物品目前作为背包道具收录 · 按 E 打开/关闭 · Esc 关闭</p>
      </section>
    </div>
  )
}
