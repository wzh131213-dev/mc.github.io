import { HOTBAR, blockIcon } from './world'

type Props = {
  selected: number
  hotbar: number[]
  onEquip: (blockId: number, targetSlot?: number) => void
  onSelect: (slot: number) => void
  onClose: () => void
}

const NAMES: Record<number, string> = {
  1: '草方块', 2: '泥土', 3: '石头', 4: '沙子', 5: '水',
  6: '原木', 7: '树叶', 8: '木板', 9: '圆石', 10: '玻璃',
}

export default function Inventory({ selected, hotbar, onEquip, onSelect, onClose }: Props) {
  const items: (number | null)[] = [...HOTBAR, ...Array.from({ length: 18 }, () => null)]
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-3" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section className="w-[min(560px,96vw)] border-4 border-[#242424] bg-[#c6c6c6] p-3 text-[#202020] shadow-[0_8px_32px_#0009]" aria-label="背包物品栏">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="font-bold text-lg">物品栏</h2>
          <button className="border-2 border-[#333] bg-[#8b8b8b] px-3 py-1 text-white" onClick={onClose}>关闭 ×</button>
        </header>
        <div className="mb-2 text-xs text-[#444]">物品栏 · 点击物品放入当前快捷栏位置</div>
        <div className="grid grid-cols-9 gap-1">
          {items.map((id, i) => (
            <button key={i} disabled={id === null} draggable={id !== null}
              onDragStart={(e) => { if (id !== null) e.dataTransfer.setData('text/plain', String(id)) }}
              onClick={() => { if (id !== null) onEquip(id) }}
              onKeyDown={(e) => { if (id !== null && (e.key === 'Enter' || e.key === ' ')) onEquip(id) }}
              title={id === null ? '空槽' : NAMES[id] || '方块'}
              className="relative aspect-square min-w-0 border-2 border-[#555] bg-[#8b8b8b] p-1 shadow-[inset_2px_2px_0_#eee,inset_-2px_-2px_0_#444] active:bg-[#aaa]">
              {id !== null && <>
                <img src={blockIcon(id)} alt={NAMES[id] || '方块'} className="h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
                <span className="absolute right-1 bottom-0 text-[10px] font-bold text-white" style={{ textShadow: '1px 1px #222' }}>64</span>
              </>}
            </button>
          ))}
        </div>
        <div className="mt-4 mb-2 text-xs text-[#444]">快捷栏 · 选择一个位置，再点击上方物品替换</div>
        <div className="grid grid-cols-9 gap-1">
          {hotbar.map((id, i) => (
            <button key={i} onClick={() => onSelect(i)} onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const value = Number(e.dataTransfer.getData('text/plain')); if (Number.isInteger(value) && value > 0) { onSelect(i); onEquip(value, i) } }}
              className="relative aspect-square min-w-0 border-2 border-[#555] bg-[#8b8b8b] p-1 shadow-[inset_2px_2px_0_#eee,inset_-2px_-2px_0_#444]"
              style={i === selected ? { outline: '3px solid white', outlineOffset: '-3px' } : undefined}>
              <img src={blockIcon(id)} alt={NAMES[id] || '方块'} className="h-full w-full" style={{ imageRendering: 'pixelated' }} />
              <span className="absolute top-0 left-1 text-[9px] text-white">{i + 1}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-[#444]">按 E 打开/关闭 · Esc 关闭背包</p>
      </section>
    </div>
  )
}
