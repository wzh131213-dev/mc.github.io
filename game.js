/* game.js（合体完整文件）
   - v3 基础：移动优先、创造/生存区分、右下按钮、删除保存按钮
   - 已实现需求：
     * 生存模式：快捷栏中的物品不在背包主列表显示（避免重复）
     * 拾取/放下交互：格子放大（.holding），放下后更新背包/快捷栏数据
     * 拿起来自 hotbar 会临时清空该 hotbar 槽；放回背包会增加背包数量（生存模式）
     * 飞行按钮仅在创造模式可见
   - 依赖：three.js、simplex-noise 请在 index.html 先加载（script src）
   - 在 DOMContentLoaded 后初始化，确保 UI 元素存在再绑定事件
*/

/* ---------- 设备检测与配置 ---------- */
const isMobile = (typeof window !== 'undefined') && (
  /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || ('ontouchstart' in window && navigator.maxTouchPoints > 0)
);

let CHUNK_SIZE_X = 16, CHUNK_SIZE_Z = 16;
let CHUNK_SIZE_Y = isMobile ? 96 : 124;
let RENDER_DISTANCE = isMobile ? 1 : 2;
const MAX_RENDER_PIXEL_RATIO = isMobile ? 1 : Math.min(2, window.devicePixelRatio || 1);

/* ---------- 方块定义 ---------- */
const BLOCK_DEFS = {
  0:{ name:'空气', color:[255,255,255], hardness:0, transparent:true },
  1:{ name:'草方块', color:[0x55,0x7a,0x2b], hardness:0.4 },
  2:{ name:'泥土', color:[0x8b,0x5a,0x2b], hardness:0.3 },
  3:{ name:'石头', color:[0x80,0x80,0x80], hardness:1.2, reqTool:'wooden_pickaxe' },
  4:{ name:'原木', color:[0x65,0x43,0x21], hardness:0.8 },
  5:{ name:'木块', color:[0xc4,0x9a,0x45], hardness:0.5 },
  6:{ name:'树叶', color:[0x2e,0x8b,0x57], hardness:0.1, transparent:true },
  8:{ name:'基岩', color:[0x33,0x33,0x33], hardness:999 },
  9:{ name:'沙子', color:[0xdb,0xc6,0x75], hardness:0.3 },
  13:{ name:'工作台', color:[0x85,0x5c,0x33], hardness:0.6 },
  14:{ name:'熔炉', color:[0x52,0x52,0x52], hardness:1.0, reqTool:'wooden_pickaxe' },
  15:{ name:'玻璃', color:[0xe0,0xf2,0xfe], hardness:0.2, transparent:true },
  16:{ name:'木镐', color:[0xa1,0x80,0x53], isItem:true, toolType:'pickaxe', toolTier:1 },
  18:{ name:'石镐', color:[0x94,0xa3,0xb8], isItem:true, toolType:'pickaxe', toolTier:2 },
  20:{ name:'面包', color:[0xd8,0xa6,0x52], isItem:true, food:6 },
  22:{ name:'苹果', color:[0xd9,0x35,0x35], isItem:true, food:4 },
  23:{ name:'煤矿', color:[0x30,0x30,0x30], hardness:2.5, reqTool:'wooden_pickaxe', ore:true },
  24:{ name:'铁矿', color:[0x9a,0x80,0x68], hardness:3.5, reqTool:'stone_pickaxe', ore:true },
  25:{ name:'金矿', color:[0xd6,0xb4,0x3c], hardness:3.5, reqTool:'iron_pickaxe', ore:true },
  26:{ name:'钻石矿', color:[0x35,0xd7,0xe8], hardness:4.5, reqTool:'iron_pickaxe', ore:true },
  27:{ name:'木棍', color:[0x8b,0x5a,0x2b], isItem:true },
  28:{ name:'木剑', color:[0xa1,0x80,0x53], isItem:true, weapon:true, damage:4 },
  36:{ name:'铁锭', color:[0xd1,0xd5,0xdb], isItem:true },
  38:{ name:'钻石', color:[0x35,0xd7,0xe8], isItem:true },
  39:{ name:'煤炭', color:[0x22,0x22,0x22], isItem:true },
  40:{ name:'铁镐', color:[0xd1,0xd5,0xdb], isItem:true, toolType:'pickaxe', toolTier:3 },
  41:{ name:'钻石镐', color:[0x35,0xd7,0xe8], isItem:true, toolType:'pickaxe', toolTier:4 },
  60:{ name:'箱子', color:[0x9a,0x6a,0x3f], hardness:2.0 }
};

/* ---------- THREE / 渲染 / 光照 ---------- */
let scene, camera, renderer;
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
const dayColor = new THREE.Color(0x87ceeb);
const nightColor = new THREE.Color(0x0f172a);

/* ---------- 全局状态 ---------- */
let world, player, playerMesh;
let isInGame = false, isThirdPerson = false;
let gameMode = 'creative';
let isFlying = false, flyVerticalState = 0;
let selectedBlockId = 1;
let hotbarSlots = [1,2,3,4,5,6,13,14,20];
let inventory = {1:10,2:10,3:10,4:10,5:10,6:10,13:1,14:1,20:5,22:5};
let heldItem = null; // {id, from: 'backpack'|'hotbar', index}
let mobs = []; let lastSpawnTime = 0;

/* ---------- 面 / DDA ---------- */
const FACES = [
  { dir:[0,0,1], corners:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
  { dir:[0,0,-1], corners:[[1,0,0],[0,0,0],[0,1,0],[1,1,0]] },
  { dir:[0,1,0], corners:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
  { dir:[0,-1,0], corners:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  { dir:[1,0,0], corners:[[1,0,1],[1,0,0],[1,1,0],[1,1,1]] },
  { dir:[-1,0,0], corners:[[0,0,0],[0,0,1],[0,1,1],[0,1,0]] }
];

function raycastVoxelDDA(origin, direction, maxDistance = 6.0) {
  let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
  const dx = direction.x, dy = direction.y, dz = direction.z;
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = Math.abs(1 / (dx || 1e-6)), tDeltaY = Math.abs(1 / (dy || 1e-6)), tDeltaZ = Math.abs(1 / (dz || 1e-6));
  let tMaxX = dx > 0 ? (Math.floor(origin.x) + 1 - origin.x) * tDeltaX : (origin.x - Math.floor(origin.x)) * tDeltaX;
  if (dx < 0 && origin.x === Math.floor(origin.x)) tMaxX = tDeltaX;
  let tMaxY = dy > 0 ? (Math.floor(origin.y) + 1 - origin.y) * tDeltaY : (origin.y - Math.floor(origin.y)) * tDeltaY;
  if (dy < 0 && origin.y === Math.floor(origin.y)) tMaxY = tDeltaY;
  let tMaxZ = dz > 0 ? (Math.floor(origin.z) + 1 - origin.z) * tDeltaZ : (origin.z - Math.floor(origin.z)) * tDeltaZ;
  if (dz < 0 && origin.z === Math.floor(origin.z)) tMaxZ = tDeltaZ;
  let hitNorm = [0,0,0], dist = 0;

  while (dist <= maxDistance) {
    const voxel = world.getVoxel(x,y,z);
    if (voxel && voxel !== 0) {
      return { hit:true, x, y, z, px: x + hitNorm[0], py: y + hitNorm[1], pz: z + hitNorm[2] };
    }
    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) { dist = tMaxX; tMaxX += tDeltaX; x += stepX; hitNorm = [-stepX,0,0]; }
      else { dist = tMaxZ; tMaxZ += tDeltaZ; z += stepZ; hitNorm = [0,0,-stepZ]; }
    } else {
      if (tMaxY < tMaxZ) { dist = tMaxY; tMaxY += tDeltaY; y += stepY; hitNorm = [0,-stepY,0]; }
      else { dist = tMaxZ; tMaxZ += tDeltaZ; z += stepZ; hitNorm = [0,0,-stepZ]; }
    }
  }
  return { hit:false };
}

/* ---------- WorldManager ---------- */
class WorldManager {
  constructor() {
    this.chunks = new Map();
    this.chunkMeshes = new Map();
    this.noise = new SimplexNoise();
  }
  getChunkKey(cx, cz) { return `${cx},${cz}`; }

  getVoxel(x,y,z) {
    if (y < 0 || y >= CHUNK_SIZE_Y) return 0;
    const cx = Math.floor(x / CHUNK_SIZE_X), cz = Math.floor(z / CHUNK_SIZE_Z);
    const chunk = this.chunks.get(this.getChunkKey(cx, cz));
    if (!chunk) return 0;
    const lx = ((x % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
    const lz = ((z % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z;
    const idx = lx + CHUNK_SIZE_X * (lz + CHUNK_SIZE_Z * y);
    return chunk[idx] || 0;
  }

  setVoxel(x,y,z,type) {
    if (y < 0 || y >= CHUNK_SIZE_Y) return;
    const cx = Math.floor(x / CHUNK_SIZE_X), cz = Math.floor(z / CHUNK_SIZE_Z);
    const key = this.getChunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) { chunk = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Y * CHUNK_SIZE_Z); this.chunks.set(key, chunk); }
    const lx = ((x % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
    const lz = ((z % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z;
    const idx = lx + CHUNK_SIZE_X * (lz + CHUNK_SIZE_Z * y);
    chunk[idx] = type;
    this.rebuildChunkMesh(cx, cz);
    if (lx === 0) this.rebuildChunkMesh(cx - 1, cz);
    if (lx === CHUNK_SIZE_X - 1) this.rebuildChunkMesh(cx + 1, cz);
    if (lz === 0) this.rebuildChunkMesh(cx, cz - 1);
    if (lz === CHUNK_SIZE_Z - 1) this.rebuildChunkMesh(cx, cz + 1);
  }

  generateChunkData(cx, cz) {
    const key = this.getChunkKey(cx, cz);
    if (this.chunks.has(key)) return;
    const data = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Y * CHUNK_SIZE_Z);
    const startX = cx * CHUNK_SIZE_X, startZ = cz * CHUNK_SIZE_Z;
    const heights = Array.from({ length: CHUNK_SIZE_X }, () => new Array(CHUNK_SIZE_Z).fill(0));
    const biomes = Array.from({ length: CHUNK_SIZE_X }, () => new Array(CHUNK_SIZE_Z).fill('plains'));

    for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
        const wx = startX + lx, wz = startZ + lz;
        const n1 = this.noise.noise2D(wx * 0.015, wz * 0.015) * 8;
        const n2 = this.noise.noise2D(wx * 0.05, wz * 0.05) * 2;
        const h = Math.floor(78 + n1 + n2);
        heights[lx][lz] = h;
        const tempNoise = this.noise.noise2D(wx * 0.006, wz * 0.006);
        let biome = 'plains';
        if (tempNoise > 0.25) biome = 'desert';
        else if (tempNoise < -0.2) biome = 'snow';
        biomes[lx][lz] = biome;

        for (let y = 0; y < CHUNK_SIZE_Y; y++) {
          const idx = lx + CHUNK_SIZE_X * (lz + CHUNK_SIZE_Z * y);
          if (y === 0) data[idx] = 8;
          else if (y < h - 3) data[idx] = 3;
          else if (y < h) data[idx] = (biome === 'desert') ? 9 : 2;
          else if (y === h) {
            if (biome === 'desert') data[idx] = 9;
            else if (biome === 'snow') data[idx] = (h > 82) ? 12 : 11;
            else data[idx] = 1;
          } else data[idx] = 0;
        }
      }
    }

    const oreTypes = [23, 24, 25, 26];
    oreTypes.forEach((oreType, oreIndex) => {
      const targetCount = 90;
      const positions = [];
      for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
          const maxStoneY = Math.min(CHUNK_SIZE_Y - 1, heights[lx][lz] - 3);
          const minY = (oreType === 26) ? 28 : 1;
          for (let y = minY; y < maxStoneY; y++) {
            const idx = lx + CHUNK_SIZE_X * (lz + CHUNK_SIZE_Z * y);
            if (data[idx] === 3) positions.push({ lx, y, lz, idx });
          }
        }
      }
      if (positions.length === 0) return;
      const seed = Math.abs(cx * 1572869 ^ cz * 3145739 ^ (oreIndex * 48271));
      const step = Math.max(1, Math.floor(positions.length / targetCount));
      let startOffset = seed % Math.max(1, step);
      let placed = 0;
      for (let i = 0; i < positions.length && placed < targetCount; i += step) {
        const posIdx = (startOffset + i) % positions.length;
        const pos = positions[posIdx];
        if (data[pos.idx] === 3) { data[pos.idx] = oreType; placed++; }
      }
      for (let i = 0; i < positions.length && placed < targetCount; i++) {
        const pos = positions[i];
        if (data[pos.idx] === 3) { data[pos.idx] = oreType; placed++; }
      }
    });

    // trees
    const seedRandom = (n) => { const x = Math.sin(n) * 10000; return x - Math.floor(x); };
    const treeSeed = Math.abs(cx * 73856093 ^ cz * 19349663);
    const treeCount = Math.floor(seedRandom(treeSeed) * 2) + 1;
    for (let t = 0; t < treeCount; t++) {
      const tx = Math.floor(seedRandom(treeSeed + t * 10 + 1) * 10) + 3;
      const tz = Math.floor(seedRandom(treeSeed + t * 10 + 2) * 10) + 3;
      if (tx < 0 || tx >= CHUNK_SIZE_X || tz < 0 || tz >= CHUNK_SIZE_Z) continue;
      if (biomes[tx][tz] !== 'plains') continue;
      const th = heights[tx][tz];
      const trunkHeight = 4;
      for (let ty = th + 1; ty <= th + trunkHeight; ty++) {
        if (ty < CHUNK_SIZE_Y) {
          const idx = tx + CHUNK_SIZE_X * (tz + CHUNK_SIZE_Z * ty);
          data[idx] = 4;
        }
      }
      const leafStart = th + trunkHeight - 1, leafEnd = th + trunkHeight + 1;
      for (let ly = leafStart; ly <= leafEnd; ly++) {
        for (let lxOffset = -1; lxOffset <= 1; lxOffset++) {
          for (let lzOffset = -1; lzOffset <= 1; lzOffset++) {
            const lwx = tx + lxOffset, lwz = tz + lzOffset;
            if (lwx >= 0 && lwx < CHUNK_SIZE_X && lwz >= 0 && lwz < CHUNK_SIZE_Z && ly < CHUNK_SIZE_Y) {
              const idx = lwx + CHUNK_SIZE_X * (lwz + CHUNK_SIZE_Z * ly);
              if (data[idx] === 0) data[idx] = 6;
            }
          }
        }
      }
    }

    this.chunks.set(key, data);
  }

  rebuildChunkMesh(cx, cz) {
    const key = this.getChunkKey(cx, cz);
    if (!this.chunks.has(key)) return;
    if (this.chunkMeshes.has(key)) {
      const old = this.chunkMeshes.get(key);
      scene.remove(old);
      old.geometry.dispose();
      if (Array.isArray(old.material)) old.material.forEach(m => m.dispose()); else old.material.dispose();
      this.chunkMeshes.delete(key);
    }

    const positions = [], colors = [], indices = [];
    let quadCount = 0;
    const data = this.chunks.get(key);
    const startX = cx * CHUNK_SIZE_X, startZ = cz * CHUNK_SIZE_Z;

    for (let y = 0; y < CHUNK_SIZE_Y; y++) {
      for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
          const wx = startX + lx, wz = startZ + lz;
          const voxel = data[lx + CHUNK_SIZE_X * (lz + CHUNK_SIZE_Z * y)];
          if (!voxel) continue;
          const def = BLOCK_DEFS[voxel] || BLOCK_DEFS[0];
          const rgb = def.color || [255,255,255];
          for (const face of FACES) {
            const nx = wx + face.dir[0], ny = y + face.dir[1], nz = wz + face.dir[2];
            const neighbor = this.getVoxel(nx, ny, nz);
            const neighborDef = BLOCK_DEFS[neighbor];
            if (neighbor === 0 || (neighborDef && neighborDef.transparent && neighbor !== voxel)) {
              for (const c of face.corners) {
                positions.push(wx + c[0], y + c[1], wz + c[2]);
                const lightFactor = face.dir[1] === 1 ? 1.0 : (face.dir[1] === -1 ? 0.45 : 0.75);
                colors.push((rgb[0]/255)*lightFactor, (rgb[1]/255)*lightFactor, (rgb[2]/255)*lightFactor);
              }
              indices.push(quadCount*4+0, quadCount*4+1, quadCount*4+2, quadCount*4+0, quadCount*4+2, quadCount*4+3);
              quadCount++;
            }
          }
        }
      }
    }

    if (positions.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshLambertMaterial({ vertexColors:true });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = false; mesh.castShadow = false;
    scene.add(mesh);
    this.chunkMeshes.set(key, mesh);
  }
}

/* ---------- PlayerEntity ---------- */
class PlayerEntity {
  constructor(x,y,z) {
    this.position = new THREE.Vector3(x,y,z);
    this.velocity = new THREE.Vector3(0,0,0);
    this.width = 0.55; this.height = 1.75; this.eyeHeight = 1.6;
    this.onGround = false;
  }
  getAABB(pos = this.position) {
    const halfW = this.width/2;
    return { minX: pos.x-halfW, maxX: pos.x+halfW, minY: pos.y+0.001, maxY: pos.y + this.height, minZ: pos.z-halfW, maxZ: pos.z+halfW };
  }
  checkCollision(aabb) {
    const minX = Math.floor(aabb.minX), maxX = Math.ceil(aabb.maxX);
    const minY = Math.floor(aabb.minY), maxY = Math.ceil(aabb.maxY);
    const minZ = Math.floor(aabb.minZ), maxZ = Math.ceil(aabb.maxZ);
    for (let x=minX;x<maxX;x++) for (let y=minY;y<maxY;y++) for (let z=minZ;z<maxZ;z++) if (world.getVoxel(x,y,z) !== 0) return true;
    return false;
  }
  update(delta, inputMoveVector) {
    if (!isFlying) this.velocity.y -= 35.0 * delta;
    this.velocity.x = inputMoveVector.x; this.velocity.z = inputMoveVector.z;
    if (isFlying) this.velocity.y = inputMoveVector.y + (flyVerticalState * 8.0);

    this.position.x += this.velocity.x * delta;
    if (this.checkCollision(this.getAABB())) { this.position.x -= this.velocity.x * delta; this.velocity.x = 0; }

    this.position.z += this.velocity.z * delta;
    if (this.checkCollision(this.getAABB())) { this.position.z -= this.velocity.z * delta; this.velocity.z = 0; }

    const realAABB = {
      minX: this.position.x - this.width/2, maxX: this.position.x + this.width/2,
      minY: this.position.y + this.velocity.y * delta, maxY: this.position.y + this.velocity.y * delta + this.height,
      minZ: this.position.z - this.width/2, maxZ: this.position.z + this.width/2
    };
    if (this.checkCollision(realAABB)) {
      if (this.velocity.y < 0) this.onGround = true;
      this.velocity.y = 0;
    } else { this.position.y += this.velocity.y * delta; this.onGround = false; }
  }
  jump() {
    if (this.onGround || isFlying) { this.velocity.y = Math.sqrt(2 * 35.0 * 20); this.onGround = false; }
  }
}

/* ---------- UI / Hotbar / Inventory / Crafting (updated) ---------- */

// Render hotbar (updated: supports empty slots and pick-up / place interactions)
function renderHotbar() {
  const hotbar = document.getElementById('hotbar'); if (!hotbar) return;
  hotbar.innerHTML = '';
  hotbarSlots.forEach((id, slotIndex) => {
    const def = id ? BLOCK_DEFS[id] : null;
    const slot = document.createElement('div');
    slot.className = 'hotbar-slot' + (selectedBlockId === id ? ' selected' : '');
    slot.dataset.slotIndex = slotIndex;

    if (def) {
      const icon = document.createElement('div'); icon.className = 'slot-icon'; icon.style.backgroundColor = `rgb(${def.color.join(',')})`;
      const name = document.createElement('div'); name.style.fontSize='11px'; name.innerText = def.name;
      const count = document.createElement('div'); count.className = 'slot-count';
      count.innerText = (gameMode === 'creative') ? '∞' : (inventory[id] || 0);
      slot.appendChild(icon); slot.appendChild(name); slot.appendChild(count);
    } else {
      const emptyLabel = document.createElement('div'); emptyLabel.style.opacity = 0.45; emptyLabel.style.fontSize = '12px'; emptyLabel.innerText = '空';
      slot.appendChild(emptyLabel);
    }

    // Click to pick up or place
    slot.addEventListener('click', () => {
      if (!heldItem) {
        if (hotbarSlots[slotIndex]) {
          // pick up from hotbar
          heldItem = { id: hotbarSlots[slotIndex], from: 'hotbar', index: slotIndex };
          hotbarSlots[slotIndex] = 0; // temporarily empty source
        }
      } else {
        // place heldItem into this slot
        const placingId = heldItem.id;
        if (heldItem.from === 'backpack') {
          if (gameMode !== 'creative') {
            inventory[placingId] = Math.max(0, (inventory[placingId] || 0) - 1);
            if (inventory[placingId] === 0) delete inventory[placingId];
          }
        }
        hotbarSlots[slotIndex] = placingId;
        heldItem = null;
      }
      renderHotbar();
      renderInventoryUI();
    });

    // allow drag drop from inventory
    slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.classList.add('drag-over'); });
    slot.addEventListener('dragleave', () => { slot.classList.remove('drag-over'); });
    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      slot.classList.remove('drag-over');
      const draggedId = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (draggedId) {
        handleSlotDrop(draggedId, slotIndex);
      }
    });

    hotbar.appendChild(slot);
  });
}

// Render inventory UI (updated: hide items that are already in hotbar when in survival)
function renderInventoryUI() {
  const hotbarGrid = document.getElementById('inv-hotbar-content');
  if (hotbarGrid) {
    hotbarGrid.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const id = hotbarSlots[i];
      const def = id ? BLOCK_DEFS[id] : null;
      const slot = document.createElement('div');
      let slotClass = 'inv-slot';
      if (heldItem && heldItem.from === 'hotbar' && heldItem.index === i) slotClass += ' holding';
      else if (selectedBlockId === id) slotClass += ' selected';
      if (!def) slotClass += ' empty';
      slot.className = slotClass;

      if (def) {
        const icon = document.createElement('div'); icon.className = 'inv-slot-icon'; icon.style.backgroundColor = `rgb(${def.color.join(',')})`;
        const name = document.createElement('div'); name.className = 'inv-slot-name'; name.innerText = def.name;
        const count = document.createElement('div'); count.className = 'inv-slot-count'; count.innerText = (gameMode === 'creative') ? '∞' : (inventory[id] || 0);
        slot.appendChild(icon); slot.appendChild(name); slot.appendChild(count);
      } else {
        const emptyLabel = document.createElement('span'); emptyLabel.className = 'inv-slot-name'; emptyLabel.style.opacity = '0.4'; emptyLabel.innerText = `栏 ${i+1}`; slot.appendChild(emptyLabel);
      }

      slot.addEventListener('click', () => {
        handleInventorySlotClick(id, 'hotbar', i);
      });

      hotbarGrid.appendChild(slot);
    }
  }

  const grid = document.getElementById('inv-grid-content');
  if (!grid) return;
  grid.innerHTML = '';

  // determine which ids are in hotbar (survival mode) to hide them from inventory grid
  const hotbarIds = new Set();
  if (gameMode === 'survival') hotbarSlots.forEach(hid => { if (hid) hotbarIds.add(hid); });

  // Iterate BLOCK_DEFS keys to maintain stable order
  Object.keys(BLOCK_DEFS).forEach(idKey => {
    const id = Number(idKey);
    const def = BLOCK_DEFS[id];
    if (!def) return;
    if (def.creativeOnly && gameMode !== 'creative') return;
    if (gameMode === 'survival' && hotbarIds.has(id)) return; // do not show items already in hotbar
    if (gameMode === 'survival' && !(inventory[id] && inventory[id] > 0)) return; // don't show zero-count items in survival

    const slot = document.createElement('div');
    let slotClass = 'inv-slot';
    if (heldItem && heldItem.from === 'backpack' && heldItem.id === id) slotClass += ' holding';
    else if (selectedBlockId === id) slotClass += ' selected';
    slot.className = slotClass;
    slot.draggable = true;
    slot.dataset.itemId = id;

    const icon = document.createElement('div'); icon.className = 'inv-slot-icon'; icon.style.backgroundColor = `rgb(${def.color.join(',')})`;
    const name = document.createElement('div'); name.className = 'inv-slot-name'; name.innerText = def.name;
    const count = document.createElement('div'); count.className = 'inv-slot-count'; count.innerText = (gameMode === 'creative') ? '∞' : (inventory[id] || 0);

    slot.appendChild(icon); slot.appendChild(name); slot.appendChild(count);

    slot.addEventListener('click', () => {
      handleInventorySlotClick(id, 'backpack', null);
    });

    slot.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'move';
    });

    grid.appendChild(slot);
  });

  // render basic recipes
  const recipesList = document.getElementById('crafting-recipes-list');
  if (recipesList) {
    recipesList.innerHTML = '';
    const basicRecipes = [
      { name: '🪵 木块 x4 (自原木x1)', cost: {4:1}, give: {5:4} },
      { name: '🪑 工作台 (自木块x4)', cost: {5:4}, give: {13:1} }
    ];
    basicRecipes.forEach(r => {
      const row = document.createElement('div'); row.className = 'recipe-row'; row.innerHTML = `<span>${r.name}</span>`;
      let canCraft = true;
      if (gameMode !== 'creative') {
        for (let id in r.cost) if ((inventory[id] || 0) < r.cost[id]) { canCraft = false; break; }
      }
      const btn = document.createElement('button'); btn.className = 'recipe-btn'; btn.innerText = '合成'; btn.disabled = !canCraft && gameMode !== 'creative';
      btn.addEventListener('click', () => {
        if (gameMode === 'creative' || canCraft) {
          if (gameMode !== 'creative') {
            for (let id in r.cost) inventory[id] -= r.cost[id];
          }
          for (let id in r.give) inventory[id] = (inventory[id] || 0) + r.give[id];
          renderInventoryUI(); renderHotbar();
        }
      });
      row.appendChild(btn);
      recipesList.appendChild(row);
    });
  }
}

// handle clicking / picking / placing (updated)
function handleInventorySlotClick(clickedId, targetType, targetIndex) {
  if (!heldItem) {
    // pick up
    if (targetType === 'backpack') {
      if (clickedId && (gameMode === 'creative' || (inventory[clickedId] || 0) > 0)) {
        heldItem = { id: clickedId, from: 'backpack', index: null };
        // do not yet decrement inventory until placed into hotbar (per UX)
      }
    } else if (targetType === 'hotbar') {
      const idInSlot = hotbarSlots[targetIndex];
      if (idInSlot) {
        heldItem = { id: idInSlot, from: 'hotbar', index: targetIndex };
        hotbarSlots[targetIndex] = 0; // temporarily remove source
      }
    }
  } else {
    // place held item
    if (targetType === 'hotbar') {
      const placingId = heldItem.id;
      if (heldItem.from === 'backpack') {
        if (gameMode !== 'creative') {
          inventory[placingId] = Math.max(0, (inventory[placingId] || 0) - 1);
          if (inventory[placingId] === 0) delete inventory[placingId];
        }
      }
      // place / overwrite
      hotbarSlots[targetIndex] = placingId;
    } else if (targetType === 'backpack') {
      const placingId = heldItem.id;
      if (heldItem.from === 'hotbar') {
        // place back into inventory (add 1)
        inventory[placingId] = (inventory[placingId] || 0) + 1;
      } else if (heldItem.from === 'backpack') {
        // returning to backpack, no-op
      }
    }
    heldItem = null;
  }
  renderHotbar();
  renderInventoryUI();
}

// handle drag-drop from inventory into hotbar (updated)
function handleSlotDrop(draggedId, targetSlotIndex) {
  if (!draggedId) return;
  if (gameMode !== 'creative') {
    inventory[draggedId] = Math.max(0, (inventory[draggedId] || 0) - 1);
    if (inventory[draggedId] === 0) delete inventory[draggedId];
  }
  hotbarSlots[targetSlotIndex] = draggedId;
  selectedBlockId = draggedId;
  heldItem = null;
  renderHotbar();
  renderInventoryUI();
}

/* ---------- Furnace (kept) ---------- */
let furnaceState = { open:false, input:0, inputCount:0, fuel:0, fuelCount:0, output:0, outputCount:0, progress:0, burn:0, maxBurn:0 };
function smeltRecipe3(id) {
  if (id === 24) return { out: 36, count: 1 };
  if (id === 25) return { out: 37, count: 1 };
  if (id === 4) return { out: 59, count: 1 };
  if (id === 48) return { out: 52, count: 1 };
  return null;
}
function fuelValue3(id) {
  if (id === 39 || id === 59) return 1600;
  if (id === 27) return 100;
  if ([4,5,13].includes(id)) return 300;
  return 0;
}
function openFurnace3() {
  furnaceState.open = true;
  let p = document.getElementById("furnacePanel3");
  if (!p) { p = document.createElement("div"); p.id = "furnacePanel3"; p.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:1200;background:rgba(25,25,25,.97);color:white;border:2px solid #888;border-radius:10px;padding:16px;width:320px;font:14px sans-serif"; document.body.appendChild(p); }
  p.style.display = "block";
  renderFurnace3();
}
function renderFurnace3() {
  const p = document.getElementById("furnacePanel3"); if (!p) return;
  const prog = Math.min(100, (furnaceState.progress / 100) * 100);
  const burn = Math.min(100, furnaceState.maxBurn ? furnaceState.burn / furnaceState.maxBurn * 100 : 0);
  const nm = id => id ? (BLOCK_DEFS[id]?.name || ("ID " + id)) : "空";
  p.innerHTML = `
      <h3 style="text-align:center;margin:0 0 12px">🔥 熔炉</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div style="background:#444;padding:12px;text-align:center">输入<br><b>${nm(furnaceState.input)}</b><br>${furnaceState.inputCount || ""}</div>
        <div style="background:#444;padding:12px;text-align:center">燃料<br><b>${nm(furnaceState.fuel)}</b><br>${furnaceState.fuelCount || ""}</div>
        <div style="background:#444;padding:12px;text-align:center">输出<br><b>${nm(furnaceState.output)}</b><br>${furnaceState.outputCount || ""}</div>
      </div>
      <div style="height:8px;background:#222;margin:10px 0"><div style="height:100%;width:${prog}%;background:#e0a34b"></div></div>
      <div style="height:8px;background:#222;margin:6px 0"><div style="height:100%;width:${burn}%;background:#d65b35"></div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px">
        <button onclick="furnacePutInput3()" style="padding:6px;border-radius:4px;cursor:pointer">放入选中物品</button>
        <button onclick="furnacePutFuel3()" style="padding:6px;border-radius:4px;cursor:pointer">放入燃料</button>
        <button onclick="furnaceTake3()" style="padding:6px;border-radius:4px;cursor:pointer">取出产物</button>
        <button onclick="closeFurnace3()" style="padding:6px;border-radius:4px;cursor:pointer">关闭</button>
      </div>`;
}
function furnacePutInput3() {
  const id = selectedBlockId, r = smeltRecipe3(id);
  if (!r || (inventory[id] || 0) <= 0) return;
  if (furnaceState.input && furnaceState.input !== id) return;
  furnaceState.input = id; furnaceState.inputCount++; inventory[id]--;
  renderInventoryUI(); renderHotbar(); renderFurnace3();
}
function furnacePutFuel3() {
  const id = selectedBlockId, v = fuelValue3(id);
  if (!v || (inventory[id] || 0) <= 0) return;
  if (furnaceState.fuel && furnaceState.fuel !== id) return;
  furnaceState.fuel = id; furnaceState.fuelCount++; inventory[id]--;
  renderInventoryUI(); renderHotbar(); renderFurnace3();
}
function furnaceTake3() {
  if (!furnaceState.output) return;
  inventory[furnaceState.output] = (inventory[furnaceState.output] || 0) + furnaceState.outputCount;
  furnaceState.output = 0; furnaceState.outputCount = 0; renderFurnace3();
}
function closeFurnace3() { furnaceState.open = false; const p = document.getElementById("furnacePanel3"); if (p) p.style.display = "none"; }
function tickFurnace3(dt) {
  if (!furnaceState.input || !furnaceState.inputCount) return;
  const r = smeltRecipe3(furnaceState.input); if (!r) return;
  if (furnaceState.output && furnaceState.output !== r.out) return;
  if (furnaceState.burn <= 0) {
    const fv = fuelValue3(furnaceState.fuel);
    if (!fv || furnaceState.fuelCount <= 0) return;
    furnaceState.burn = fv; furnaceState.maxBurn = fv; furnaceState.fuelCount--;
  }
  furnaceState.burn -= dt * 20; furnaceState.progress += dt * 20;
  if (furnaceState.progress >= 100) {
    furnaceState.progress = 0; furnaceState.inputCount--;
    furnaceState.output = r.out; furnaceState.outputCount++;
    if (furnaceState.inputCount <= 0) furnaceState.input = 0;
  }
  if (furnaceState.open) renderFurnace3();
}

/* ---------- 挖掘 / 放置 ---------- */
let miningTarget = null, miningElapsed = 0, miningTotalTime = 1;
function getBlockBreakTime(voxelType, heldItemId) {
  const blockDef = BLOCK_DEFS[voxelType];
  if (!blockDef) return 0;
  if (voxelType === 8) return Infinity;
  let baseTime = 1.2;
  if (voxelType === 3) baseTime = 3.2;
  else if (voxelType === 14) baseTime = 2.5;
  else if (voxelType === 6 || voxelType === 15) baseTime = 0.3;
  const heldDef = BLOCK_DEFS[heldItemId];
  let speedMultiplier = 1.0;
  if (heldDef && heldDef.isItem && heldDef.toolType) {
    let isToolMatched = false;
    if (heldDef.toolType === 'pickaxe' && (voxelType === 3 || voxelType === 14 || BLOCK_DEFS[voxelType]?.ore)) isToolMatched = true;
    if (isToolMatched) {
      if (heldDef.toolTier === 1) speedMultiplier = 2.2;
      else if (heldDef.toolTier === 2) speedMultiplier = 4.2;
      else if (heldDef.toolTier >= 3) speedMultiplier = 7.0;
    }
  }
  return baseTime / speedMultiplier;
}

function handleBlockPlace() {
  if (!isInGame || isInventoryOpen || isCraftingTableOpen || !player) return;
  const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).normalize();
  const eyePos = player.position.clone(); eyePos.y += player.eyeHeight;
  const hitResult = raycastVoxelDDA(eyePos, dir, 6.0);
  if (hitResult.hit) {
    const voxelTypeHit = world.getVoxel(hitResult.x, hitResult.y, hitResult.z);
    if (voxelTypeHit === 13) { toggleCraftingTable(); return; }
    if (voxelTypeHit === 14) { openFurnace3(); return; }
    if (voxelTypeHit === 60) { return; }
    const placeDef = BLOCK_DEFS[selectedBlockId];
    if (placeDef && !placeDef.isItem) {
      if (gameMode === 'creative' || (inventory[selectedBlockId] && inventory[selectedBlockId] > 0)) {
        const targetAABB = { minX: hitResult.px, maxX: hitResult.px+1, minY: hitResult.py, maxY: hitResult.py+1, minZ: hitResult.pz, maxZ: hitResult.pz+1 };
        const playerAABB = player.getAABB();
        const overlap = !(targetAABB.maxX <= playerAABB.minX || targetAABB.minX >= playerAABB.maxX || targetAABB.maxY <= playerAABB.minY || targetAABB.minY >= playerAABB.maxY || targetAABB.maxZ <= playerAABB.minZ || targetAABB.minZ >= playerAABB.maxZ);
        if (!overlap) {
          world.setVoxel(hitResult.px, hitResult.py, hitResult.pz, selectedBlockId);
          if (gameMode !== 'creative') { inventory[selectedBlockId]--; renderHotbar(); }
        }
      }
    }
  }
}

function handleInstantBreak() {
  const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).normalize();
  const eyePos = player.position.clone(); eyePos.y += player.eyeHeight;
  const hitResult = raycastVoxelDDA(eyePos, dir, 6.0);
  if (hitResult.hit) {
    const voxelTypeHit = world.getVoxel(hitResult.x, hitResult.y, hitResult.z);
    if (voxelTypeHit !== 8) {
      world.setVoxel(hitResult.x, hitResult.y, hitResult.z, 0);
      if (gameMode !== 'creative') {
        const drops = ({23:39, 24:36, 25:37, 26:38})[voxelTypeHit] || voxelTypeHit;
        inventory[drops] = (inventory[drops] || 0) + 1;
        renderHotbar();
      }
    }
  }
}

function updateMiningProcess(delta) {
  const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).normalize();
  const eyePos = player.position.clone(); eyePos.y += player.eyeHeight;
  const hitResult = raycastVoxelDDA(eyePos, dir, 6.0);
  if (hitResult.hit) {
    const voxelType = world.getVoxel(hitResult.x, hitResult.y, hitResult.z);
    if (voxelType === 8) { resetMiningProcess(); return; }
    const def = BLOCK_DEFS[voxelType];
    if (def && def.reqTool) {
      const currentItemDef = BLOCK_DEFS[selectedBlockId];
      const requiredTier = def.reqTool === 'wooden_pickaxe' ? 1 : def.reqTool === 'stone_pickaxe' ? 2 : def.reqTool === 'iron_pickaxe' ? 3 : 0;
      const playerTier = (currentItemDef && currentItemDef.toolTier) || 0;
      if (playerTier < requiredTier) { resetMiningProcess(); return; }
    }
    if (miningTarget && miningTarget.x === hitResult.x && miningTarget.y === hitResult.y && miningTarget.z === hitResult.z) {
      miningElapsed += delta;
      const pct = Math.min(100, (miningElapsed / miningTotalTime) * 100);
      const progressContainer = document.getElementById('mining-progress-container');
      const progressBar = document.getElementById('mining-progress-bar');
      if (progressContainer && progressBar) { progressContainer.style.display = 'block'; progressBar.style.width = pct + '%'; }
      if (miningElapsed >= miningTotalTime) {
        world.setVoxel(hitResult.x, hitResult.y, hitResult.z, 0);
        if (gameMode !== 'creative') {
          const drops = ({23:39, 24:36, 25:37, 26:38})[voxelType] || voxelType;
          inventory[drops] = (inventory[drops] || 0) + 1;
          renderHotbar();
        }
        resetMiningProcess();
      }
    } else {
      miningTarget = { x: hitResult.x, y: hitResult.y, z: hitResult.z };
      miningElapsed = 0;
      miningTotalTime = getBlockBreakTime(voxelType, selectedBlockId);
    }
  } else resetMiningProcess();
}

function resetMiningProcess() {
  miningTarget = null; miningElapsed = 0;
  const cont = document.getElementById('mining-progress-container'); if (cont) cont.style.display = 'none';
}

/* ---------- 输入 / 摇杆 / 触控 ---------- */
let yaw = 0, pitch = 0;
const keys = {};
let joystickPointerId = null, joystickOrigin = { x:0, y:0 }, joystickMove = { x:0, y:0 };
let lookPointerId = null, lastLookPos = { x:0, y:0 };

function updateJoystick(clientX, clientY, knobEl) {
  let dx = clientX - joystickOrigin.x, dy = clientY - joystickOrigin.y;
  const maxDist = 48;
  const dist = Math.hypot(dx, dy);
  if (dist > maxDist) { dx = dx/dist * maxDist; dy = dy/dist * maxDist; }
  if (knobEl) knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
  joystickMove = { x: dx / maxDist, y: dy / maxDist };
}

/* ---------- 引擎初始化 / 渲染 ---------- */
function initEngine() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.FogExp2(0x87ceeb, 0.012);
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ antialias:false, powerPreference: isMobile ? 'low-power' : 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(MAX_RENDER_PIXEL_RATIO);
  document.body.appendChild(renderer.domElement);

  scene.add(ambientLight);
  dirLight.position.set(40,80,40);
  scene.add(dirLight);

  world = new WorldManager();

  const spawnChunkRadius = RENDER_DISTANCE;
  for (let cx = -spawnChunkRadius; cx <= spawnChunkRadius; cx++) for (let cz = -spawnChunkRadius; cz <= spawnChunkRadius; cz++) world.generateChunkData(cx, cz);
  for (let cx = -spawnChunkRadius; cx <= spawnChunkRadius; cx++) for (let cz = -spawnChunkRadius; cz <= spawnChunkRadius; cz++) world.rebuildChunkMesh(cx, cz);

  let spawnY = isMobile ? 92 : 95;
  for (let y = CHUNK_SIZE_Y - 2; y >= 1; y--) { if (world.getVoxel(0,y,0) !== 0) { spawnY = y + 1; break; } }
  player = new PlayerEntity(0, spawnY, 0);

  playerMesh = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3b82f6 });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xf2c29b });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.65,0.9,0.38), bodyMat); body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.62,0.62,0.62), skinMat); head.position.y = 1.7;
  playerMesh.add(body, head); playerMesh.visible = false; scene.add(playerMesh);

  window.addEventListener('resize', onWindowResize);
}

function updateWorldChunks() {
  if (!world || !player) return;
  const pcx = Math.floor(player.position.x / CHUNK_SIZE_X);
  const pcz = Math.floor(player.position.z / CHUNK_SIZE_Z);
  for (let cx = pcx - RENDER_DISTANCE; cx <= pcx + RENDER_DISTANCE; cx++) {
    for (let cz = pcz - RENDER_DISTANCE; cz <= pcz + RENDER_DISTANCE; cz++) {
      const key = world.getChunkKey(cx, cz);
      if (!world.chunks.has(key)) {
        world.generateChunkData(cx, cz);
        world.rebuildChunkMesh(cx, cz);
      }
    }
  }
}

/* ---------- 日夜 / 怪物 / 饥饿 ---------- */
let dayTime = 0, survivalDays = 1;
const DAY_DURATION = 120.0;
let isNightVisionOn = false;
const MAX_HP = 20, MAX_HUNGER = 100;
let hp = MAX_HP, hunger = MAX_HUNGER, hungerTimer = 0, starvationTimer = 0;

function updateDayNightCycle(delta) {
  const old = dayTime;
  dayTime = (dayTime + delta / DAY_DURATION) % 1;
  if (dayTime < old) { survivalDays++; const el = document.getElementById('day-count-val'); if (el) el.innerText = survivalDays; }
  const angle = dayTime * Math.PI * 2;
  dirLight.position.x = Math.cos(angle) * 100; dirLight.position.y = Math.sin(angle) * 100; dirLight.position.z = Math.sin(angle) * 30;
  const sunHeight = Math.sin(angle);
  let periodText = '白天';
  if (sunHeight > 0.2) { scene.background.copy(dayColor); scene.fog.color.copy(dayColor); dirLight.intensity = 0.8; ambientLight.intensity = 0.7; periodText = '白天'; }
  else if (sunHeight > -0.2) { dirLight.intensity = 0.4; ambientLight.intensity = 0.3; periodText = sunHeight > 0 ? '黄昏' : '傍晚'; }
  else { scene.background.copy(nightColor); scene.fog.color.copy(nightColor); dirLight.intensity = 0.15; ambientLight.intensity = 0.15; periodText = '夜晚'; }
  if (isNightVisionOn) { scene.background.copy(dayColor); scene.fog.color.copy(dayColor); dirLight.intensity = 1.2; ambientLight.intensity = 1.0; }
  const periodEl = document.getElementById('time-period-val'); if (periodEl) periodEl.innerText = periodText;

  if (gameMode === 'survival') {
    const isNight = sunHeight < -0.2;
    const now = performance.now();
    if (!isNight && mobs.length > 0) { mobs.forEach(m => scene.remove(m)); mobs.length = 0; }
    if (isNight && now - lastSpawnTime > 7000) {
      lastSpawnTime = now;
      if (mobs.length < 15) {
        const angle = Math.random() * Math.PI * 2; const dist = 14 + Math.random() * 10;
        const sx = player.position.x + Math.cos(angle) * dist; const sz = player.position.z + Math.sin(angle) * dist;
        const sy = Math.max(1, Math.floor(world.getVoxel(Math.floor(sx), 100, Math.floor(sz)) ? 100 : 80));
        const mob = new THREE.Mesh(new THREE.BoxGeometry(0.8,1.8,0.8), new THREE.MeshLambertMaterial({ color: 0x15803d }));
        mob.position.set(sx, sy + 2, sz); mob.userData = { hp:3, lastAttack:0 };
        scene.add(mob); mobs.push(mob);
      }
    }
    for (let i = mobs.length - 1; i >= 0; i--) {
      const m = mobs[i]; const dist = m.position.distanceTo(player.position);
      if (dist < 22) {
        const dir = new THREE.Vector3().subVectors(player.position, m.position); dir.y = 0; dir.normalize();
        m.position.addScaledVector(dir, 2.2 * delta);
        m.lookAt(player.position.x, m.position.y, player.position.z);
      }
      if (dist < 1.3 && performance.now() - m.userData.lastAttack > 1200) { m.userData.lastAttack = performance.now(); takeDamage(2); }
    }
  }
}

function updateHungerAndHealth(delta) {
  if (gameMode !== 'survival' || hp <= 0) return;
  hungerTimer += delta;
  if (hungerTimer >= 16) { hungerTimer = 0; if (hunger > 0) { hunger = Math.max(0, hunger - 1); updateHungerUI(); } }
  if (hunger === 0) { starvationTimer += delta; if (starvationTimer >= 10) { starvationTimer = 0; takeDamage(1); } }
}

function takeDamage(amt) { if (gameMode !== 'survival' || hp <= 0) return; hp = Math.max(0, hp - amt); updateHealthUI(); if (hp <= 0) { isInGame = false; const ds = document.getElementById('death-screen'); if (ds) ds.style.display = 'flex'; const ch = document.getElementById('crosshair'); if (ch) ch.style.display = 'none'; resetMiningProcess(); } }
function updateHealthUI() { const bar = document.getElementById('health-bar'); if (!bar) return; bar.innerHTML = ''; const hearts = Math.ceil(hp/2); for (let i=0;i<MAX_HP/2;i++){ const h = document.createElement('span'); h.className='heart-unit'; h.innerText = i<hearts ? '❤️' : '🖤'; bar.appendChild(h); } }
function updateHungerUI() { const fill = document.getElementById('hunger-bar-fill'); const text = document.getElementById('hunger-val-text'); const pct = (hunger / MAX_HUNGER) * 100; if (fill) fill.style.width = pct + '%'; if (text) text.innerText = `${hunger}/${MAX_HUNGER}`; }
function consumeSelectedFood() { if (!isInGame || gameMode !== 'survival') return; const def = BLOCK_DEFS[selectedBlockId]; if (!def || !def.food || (inventory[selectedBlockId]||0) <= 0) return; if (hunger >= MAX_HUNGER) return; hunger = Math.min(MAX_HUNGER, hunger + def.food * 10); hp = Math.min(MAX_HP, hp + 2); inventory[selectedBlockId]--; starvationTimer=0; hungerTimer=0; updateHungerUI(); updateHealthUI(); renderHotbar(); renderInventoryUI(); }

/* ---------- 动画循环 ---------- */
let lastTime = performance.now(), frameCount = 0, fpsTime = 0;
let isLeftMouseDown = false, isBreakBtnHeld = false, creativeBreakCooldown = 0;
let isSprinting = false, isCrouching = false, isInventoryOpen = false, isCraftingTableOpen = false;

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const delta = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  frameCount++; fpsTime += delta;
  if (fpsTime >= 1.0) {
    const fpsEl = document.getElementById('fps-val'); if (fpsEl) fpsEl.innerText = Math.round(frameCount / fpsTime);
    const chunkEl = document.getElementById('chunk-val'); if (chunkEl) chunkEl.innerText = world ? world.chunkMeshes.size : 0;
    frameCount = 0; fpsTime = 0;
  }

  if (isInGame && player) {
    const moveVec = new THREE.Vector3(0,0,0);
    let speed = isFlying ? 12.0 : (isSprinting ? 7.5 : (isCrouching ? 2.5 : 4.3));
    if (keys['KeyW']) moveVec.z -= 1; if (keys['KeyS']) moveVec.z += 1; if (keys['KeyA']) moveVec.x -= 1; if (keys['KeyD']) moveVec.x += 1;
    if (joystickMove.x !== 0 || joystickMove.y !== 0) { moveVec.x = joystickMove.x; moveVec.z = joystickMove.y; }
    if (moveVec.lengthSq() > 0) {
      moveVec.normalize();
      const forward = new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
      const worldDir = new THREE.Vector3().addScaledVector(right, moveVec.x).addScaledVector(forward, -moveVec.z).normalize();
      moveVec.x = worldDir.x * speed; moveVec.z = worldDir.z * speed;
    }

    player.update(delta, moveVec);

    if (playerMesh) { playerMesh.position.copy(player.position); playerMesh.rotation.y = yaw; }

    if (isThirdPerson) {
      const dist = 4.0;
      const camX = player.position.x + Math.sin(yaw) * Math.cos(pitch) * dist;
      const camY = player.position.y + player.eyeHeight - Math.sin(pitch) * dist;
      const camZ = player.position.z + Math.cos(yaw) * Math.cos(pitch) * dist;
      camera.position.set(camX, camY, camZ); camera.lookAt(player.position.x, player.position.y + player.eyeHeight, player.position.z);
    } else {
      camera.position.set(player.position.x, player.position.y + player.eyeHeight, player.position.z);
      camera.rotation.order = 'YXZ'; camera.rotation.y = yaw; camera.rotation.x = pitch;
    }

    const coordsEl = document.getElementById('coords-val'); if (coordsEl) coordsEl.innerText = `${Math.floor(player.position.x)}, ${Math.floor(player.position.y)}, ${Math.floor(player.position.z)}`;

    updateWorldChunks();
    updateDayNightCycle(delta);
    updateHungerAndHealth(delta);
    tickFurnace3(delta);

    if (isLeftMouseDown || isBreakBtnHeld) {
      if (gameMode === 'creative') {
        creativeBreakCooldown -= delta;
        if (creativeBreakCooldown <= 0) { handleInstantBreak(); creativeBreakCooldown = 0.12; }
      } else updateMiningProcess(delta);
    } else resetMiningProcess();
  }

  renderer.render(scene, camera);
}

/* ---------- 窗口处理 ---------- */
function onWindowResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ---------- UI 事件绑定（安全） ---------- */
function setupUIEvents() {
  const cardCreative = document.getElementById('card-creative');
  const cardSurvival = document.getElementById('card-survival');
  const respawnBtn = document.getElementById('respawn-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const invToggleBtn = document.getElementById('inv-toggle-btn');
  const invCloseBtn = document.getElementById('inv-close-btn');
  const craftingCloseBtn = document.getElementById('crafting-table-close-btn');
  const viewToggleBtn = document.getElementById('view-toggle-btn');
  const nightvisionBtn = document.getElementById('nightvision-btn');
  const breakBtn = document.getElementById('break-btn');
  const placeBtn = document.getElementById('place-btn');
  const flyBtn = document.getElementById('fly-btn');
  const flyUp = document.getElementById('fly-up-btn');
  const flyDown = document.getElementById('fly-down-btn');
  const mobileJumpBtn = document.getElementById('mobile-jump-only');
  const joystickZone = document.getElementById('joystick-zone');
  const joystickKnob = document.getElementById('joystick-knob');
  const lookZone = document.getElementById('touch-look-zone');

  if (cardCreative) cardCreative.addEventListener('click', () => startGame('creative'));
  if (cardSurvival) cardSurvival.addEventListener('click', () => startGame('survival'));
  if (respawnBtn) respawnBtn.addEventListener('click', respawnPlayer);
  if (pauseBtn) pauseBtn.addEventListener('click', showMainMenu);
  if (invToggleBtn) invToggleBtn.addEventListener('click', toggleInventory);
  if (invCloseBtn) invCloseBtn.addEventListener('click', toggleInventory);
  if (craftingCloseBtn) craftingCloseBtn.addEventListener('click', toggleCraftingTable);

  if (viewToggleBtn) viewToggleBtn.addEventListener('click', (e)=>{ e.stopPropagation(); toggleThirdPerson(); });
  if (nightvisionBtn) nightvisionBtn.addEventListener('click', ()=>{ isNightVisionOn = !isNightVisionOn; nightvisionBtn.style.background = isNightVisionOn ? 'rgba(34,197,94,.8)' : 'rgba(126,34,206,.8)'; });

  if (breakBtn) {
    breakBtn.addEventListener('touchstart', (e)=>{ e.preventDefault(); isBreakBtnHeld = true; }, { passive: false });
    breakBtn.addEventListener('touchend', ()=>{ isBreakBtnHeld = false; });
    breakBtn.addEventListener('touchcancel', ()=>{ isBreakBtnHeld = false; });
  }

  if (placeBtn) {
    placeBtn.addEventListener('touchstart', (e)=>{ e.preventDefault(); handleBlockPlace(); }, { passive: false });
    placeBtn.addEventListener('click', handleBlockPlace);
  }

  if (flyBtn) {
    flyBtn.addEventListener('click', ()=>{ isFlying = !isFlying; flyBtn.style.background = isFlying ? 'rgba(34,197,94,.8)' : 'rgba(168,85,247,.6)'; if (flyUp) flyUp.style.display = isFlying ? 'flex' : 'none'; if (flyDown) flyDown.style.display = isFlying ? 'flex' : 'none'; });
  }

  if (flyUp) { flyUp.addEventListener('touchstart', (e)=>{ e.preventDefault(); flyVerticalState = 1; }, { passive:false }); flyUp.addEventListener('touchend', ()=>{ flyVerticalState = 0; }); flyUp.addEventListener('mousedown', ()=>{ flyVerticalState = 1; }); flyUp.addEventListener('mouseup', ()=>{ flyVerticalState = 0; }); }
  if (flyDown) { flyDown.addEventListener('touchstart', (e)=>{ e.preventDefault(); flyVerticalState = -1; }, { passive:false }); flyDown.addEventListener('touchend', ()=>{ flyVerticalState = 0; }); flyDown.addEventListener('mousedown', ()=>{ flyVerticalState = -1; }); flyDown.addEventListener('mouseup', ()=>{ flyVerticalState = 0; }); }

  if (mobileJumpBtn) {
    mobileJumpBtn.addEventListener('touchstart', (e)=>{ e.preventDefault(); if (player) player.jump(); }, { passive:false });
    mobileJumpBtn.addEventListener('click', ()=>{ if (player) player.jump(); });
  }

  if (joystickZone && joystickKnob) {
    joystickZone.addEventListener('touchstart', (e)=>{ e.preventDefault(); const t = e.targetTouches[0]; joystickPointerId = t.identifier; const rect = joystickZone.getBoundingClientRect(); joystickOrigin = { x: rect.left + rect.width/2, y: rect.top + rect.height/2 }; updateJoystick(t.clientX, t.clientY, joystickKnob); }, { passive:false });
    joystickZone.addEventListener('touchmove', (e)=>{ e.preventDefault(); for (let i=0;i<e.changedTouches.length;i++) if (e.changedTouches[i].identifier === joystickPointerId) { updateJoystick(e.changedTouches[i].clientX, e.changedTouches[i].clientY, joystickKnob); break; } }, { passive:false });
    const resetJoy = (e)=>{ for (let i=0;i<e.changedTouches.length;i++) if (e.changedTouches[i].identifier === joystickPointerId) { joystickPointerId = null; joystickMove = {x:0,y:0}; joystickKnob.style.transform = `translate(0px,0px)`; break; } };
    joystickZone.addEventListener('touchend', resetJoy); joystickZone.addEventListener('touchcancel', resetJoy);
  }

  if (lookZone) {
    lookZone.addEventListener('touchstart', (e)=>{ const t = e.targetTouches[0]; lookPointerId = t.identifier; lastLookPos = { x: t.clientX, y: t.clientY }; });
    lookZone.addEventListener('touchmove', (e)=>{ for (let i=0;i<e.changedTouches.length;i++){ const t = e.changedTouches[i]; if (t.identifier === lookPointerId) { const dx = t.clientX - lastLookPos.x; const dy = t.clientY - lastLookPos.y; yaw -= dx * 0.005; pitch -= dy * 0.005; pitch = Math.max(-Math.PI/2+0.01, Math.min(Math.PI/2-0.01, pitch)); lastLookPos = { x: t.clientX, y: t.clientY }; break; } } });
    const resetLook = (e)=>{ for (let i=0;i<e.changedTouches.length;i++) if (e.changedTouches[i].identifier === lookPointerId) { lookPointerId = null; break; } };
    lookZone.addEventListener('touchend', resetLook); lookZone.addEventListener('touchcancel', resetLook);
  }

  window.addEventListener('keydown', (e)=> {
    keys[e.code] = true;
    if (e.code === 'KeyE') { if (isCraftingTableOpen) toggleCraftingTable(); else toggleInventory(); }
    if (e.code === 'Space' && player) player.jump();
    if (/^Digit[1-9]$/.test(e.code)) { const slot = Number(e.code.slice(-1)) - 1; if (slot >=0 && slot < hotbarSlots.length) { selectedBlockId = hotbarSlots[slot]; renderHotbar(); } }
    if (e.code === 'KeyV') toggleThirdPerson();
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') isSprinting = true;
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') isCrouching = true;
    if (e.code === 'KeyF') consumeSelectedFood();
  });
  window.addEventListener('keyup', (e)=>{ keys[e.code] = false; if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') isSprinting = false; if (e.code === 'ControlLeft' || e.code === 'ControlRight') isCrouching = false; });

  if (!isMobile) {
    window.addEventListener('mousemove', (e)=> { if (document.pointerLockElement === document.body) { yaw -= e.movementX * 0.003; pitch -= e.movementY * 0.003; pitch = Math.max(-Math.PI/2+0.01, Math.min(Math.PI/2-0.01, pitch)); } });
    window.addEventListener('mousedown', (e)=> { if (isInGame && !isInventoryOpen && !isCraftingTableOpen) { if (document.pointerLockElement !== document.body) document.body.requestPointerLock?.(); else { if (e.button === 0) isLeftMouseDown = true; if (e.button === 2) handleBlockPlace(); } } });
    window.addEventListener('mouseup', (e)=> { if (e.button === 0) isLeftMouseDown = false; });
  }
}

/* ---------- UI 显示控制 ---------- */
function startGame(mode) {
  gameMode = mode; isInGame = true;
  const mainMenu = document.getElementById('main-menu'); if (mainMenu) mainMenu.style.display = 'none';
  const inGameUI = document.getElementById('in-game-ui'); if (inGameUI) inGameUI.style.display = 'block';
  const cross = document.getElementById('crosshair'); if (cross) cross.style.display = isThirdPerson ? 'none' : 'block';
  if (playerMesh) playerMesh.visible = isThirdPerson;
  const statusContainer = document.getElementById('status-container'); if (statusContainer) statusContainer.style.display = mode === 'survival' ? 'flex' : 'none';
  const flyBtnEl = document.getElementById('fly-btn'); if (flyBtnEl) flyBtnEl.style.display = mode === 'creative' ? 'flex' : 'none';
  renderHotbar(); renderInventoryUI();
}
function respawnPlayer() {
  const ds = document.getElementById('death-screen'); if (ds) ds.style.display = 'none';
  player.position.set(0, isMobile ? 92 : 95, 0); player.velocity.set(0,0,0);
  hp = MAX_HP; hunger = MAX_HUNGER; isInGame = true;
  const cross = document.getElementById('crosshair'); if (cross) cross.style.display = isThirdPerson ? 'none' : 'block';
  if (playerMesh) playerMesh.visible = isThirdPerson;
  updateHealthUI(); updateHungerUI();
}
function showMainMenu() {
  isInGame = false;
  const mainMenu = document.getElementById('main-menu'); if (mainMenu) mainMenu.style.display = 'flex';
  const inGameUI = document.getElementById('in-game-ui'); if (inGameUI) inGameUI.style.display = 'none';
  const cross = document.getElementById('crosshair'); if (cross) cross.style.display = 'none';
  if (playerMesh) playerMesh.visible = false;
}
function toggleInventory() {
  if (isCraftingTableOpen) return;
  isInventoryOpen = !isInventoryOpen; heldItem = null;
  const modal = document.getElementById('inventory-modal'); if (modal) modal.style.display = isInventoryOpen ? 'flex' : 'none';
  if (isInventoryOpen) { if (document.pointerLockElement) document.exitPointerLock?.(); renderInventoryUI(); resetMiningProcess(); }
}
function toggleCraftingTable() {
  if (isInventoryOpen) return;
  isCraftingTableOpen = !isCraftingTableOpen;
  const modal = document.getElementById('crafting-table-modal'); if (modal) modal.style.display = isCraftingTableOpen ? 'flex' : 'none';
  if (isCraftingTableOpen) { if (document.pointerLockElement) document.exitPointerLock?.(); renderCraftingTableUI(); resetMiningProcess(); }
}
function toggleThirdPerson() { isThirdPerson = !isThirdPerson; const cross = document.getElementById('crosshair'); if (cross) cross.style.display = isThirdPerson ? 'none' : 'block'; if (playerMesh) playerMesh.visible = isThirdPerson; }

/* ---------- Crafting UI (kept) ---------- */
function renderCraftingTableUI() {
  const recipesList = document.getElementById('advanced-recipes-list'); if (!recipesList) return;
  recipesList.innerHTML = '';
  const advancedRecipes = [
    { name: '🪵 木棍 x4', cost: {5: 2}, give: {27: 4} },
    { name: '⚔️ 木剑', cost: {5: 2, 27: 1}, give: {28: 1} },
    { name: '⛏️ 铁镐', cost: {36: 3, 27: 2}, give: {40: 1} },
    { name: '⛏️ 钻石镐', cost: {38: 3, 27: 2}, give: {41: 1} }
  ];
  advancedRecipes.forEach(r => {
    const row = document.createElement('div'); row.className = 'recipe-row'; row.innerHTML = `<span>${r.name}</span>`;
    let canCraft = true;
    if (gameMode !== 'creative') {
      for (let id in r.cost) if ((inventory[id] || 0) < r.cost[id]) { canCraft = false; break; }
    }
    const btn = document.createElement('button'); btn.className = 'recipe-btn'; btn.innerText = '制作/烧制'; btn.disabled = !canCraft && gameMode !== 'creative';
    btn.addEventListener('click', () => {
      if (gameMode === 'creative' || canCraft) {
        if (gameMode !== 'creative') for (let id in r.cost) inventory[id] -= r.cost[id];
        for (let id in r.give) inventory[id] = (inventory[id] || 0) + r.give[id];
        renderCraftingTableUI(); renderHotbar();
      }
    });
    row.appendChild(btn); recipesList.appendChild(row);
  });
}

/* ---------- DOMContentLoaded 启动 ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // Ensure initial UI state
  const mainMenu = document.getElementById('main-menu');
  const inventoryModal = document.getElementById('inventory-modal');
  const craftingModal = document.getElementById('crafting-table-modal');
  const inGameUI = document.getElementById('in-game-ui');
  const deathScreen = document.getElementById('death-screen');
  const crosshair = document.getElementById('crosshair');
  if (mainMenu) mainMenu.style.display = 'flex';
  if (inventoryModal) inventoryModal.style.display = 'none';
  if (craftingModal) craftingModal.style.display = 'none';
  if (inGameUI) inGameUI.style.display = 'none';
  if (deathScreen) deathScreen.style.display = 'none';
  if (crosshair) crosshair.style.display = 'none';

  initEngine();
  setupUIEvents();
  renderHotbar();
  renderInventoryUI();
  animate();
});

/* ---------- 调试接口 ---------- */
window.gameDebug = {
  worldRef: () => world,
  playerRef: () => player,
  setMode: (m) => { gameMode = m; renderHotbar(); renderInventoryUI(); }
};

// ---------- v6 安全版：带密码保护的 in-game 调试面板（粘到 game.js 末尾） ----------
(function installInGameDebugPanelWithPassword() {
  if (document.getElementById('dbg-panel-root')) return;

  const PASSWORD = '@%#-¥+'; // 验证密码（按你提供的）
  const SESSION_KEY = 'dbg_auth_v6';

  // 等待游戏准备（DOM 就绪 + world/player 或 gameDebug 可用）
  const readyCheck = () => {
    const domReady = document.readyState === 'complete' || document.readyState === 'interactive';
    const gameReady = (typeof world !== 'undefined' && world) && (typeof player !== 'undefined' && player);
    const debugApiReady = !!(window.gameDebug && typeof window.gameDebug.worldRef === 'function');
    return domReady && (gameReady || debugApiReady);
  };

  // 创建并安装面板（内部会被多次调用 guard）
  const doInstall = () => {
    if (document.getElementById('dbg-panel-root')) return;

    // CSS
    const css = `
      #dbg-panel-root { position: fixed; right: 12px; top: 12px; z-index: 3000; font-family: sans-serif; }
      #dbg-toggle-btn { background: rgba(0,0,0,0.6); color: #fff; padding: 6px 10px; border-radius: 8px; cursor: pointer; font-weight:700; border:1px solid rgba(255,255,255,0.12); }
      #dbg-panel { margin-top:8px; width:320px; background:rgba(10,12,20,0.92); color:#dbeafe; border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:10px; display:none; box-shadow:0 8px 30px rgba(0,0,0,0.65); }
      #dbg-panel h4 { margin:0 0 6px 0; font-size:13px; color:#fff; }
      .dbg-row { display:flex; justify-content:space-between; gap:8px; align-items:center; margin:6px 0; font-size:13px; }
      .dbg-input { width:80px; padding:6px; border-radius:6px; border:1px solid rgba(255,255,255,0.06); background:rgba(255,255,255,0.03); color:#fff; }
      .dbg-btn { padding:6px 8px; border-radius:6px; border:none; cursor:pointer; background:#1f2937; color:#fff; font-weight:700; }
      .dbg-small { padding:4px 6px; font-size:12px; border-radius:6px; }
      #dbg-close { float:right; cursor:pointer; opacity:0.7; }
      #dbg-auth-modal { position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); z-index:4000; background:rgba(8,10,12,0.96); color:#fff; padding:14px; border-radius:10px; border:1px solid rgba(255,255,255,0.06); display:none; min-width:280px; box-shadow:0 12px 40px rgba(0,0,0,0.7); }
      #dbg-auth-modal input { width:100%; padding:8px; margin-top:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.06); background:rgba(255,255,255,0.03); color:#fff; }
      #dbg-auth-modal .row { display:flex; gap:8px; margin-top:10px; justify-content:flex-end; }
      #dbg-panel .small-note { font-size:11px; color:#9ca3af; margin-top:6px; }
      @media (max-width:600px) { #dbg-panel { width:92vw; } #dbg-panel-root { right:8px; top:8px; } }
    `;
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

    // DOM 根
    const root = document.createElement('div'); root.id = 'dbg-panel-root';
    const toggle = document.createElement('button'); toggle.id = 'dbg-toggle-btn'; toggle.innerText = 'DBG';
    const panel = document.createElement('div'); panel.id = 'dbg-panel';

    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h4>调试面板</h4><span id="dbg-close">×</span>
      </div>
      <div class="dbg-row"><span>坐标</span><span id="dbg-coords">0,0,0</span></div>
      <div class="dbg-row"><span>模式</span><span id="dbg-mode">-</span></div>
      <div class="dbg-row"><span>区块数</span><span id="dbg-chunks">0</span></div>
      <div class="dbg-row"><span>生命/饥饿</span><span id="dbg-hp">20</span></div>
      <hr style="border:none;border-top:1px solid rgba(255,255,255,0.04);margin:8px 0;" />
      <div style="display:flex;gap:6px;margin-bottom:6px;">
        <button class="dbg-btn" id="dbg-toggle-mode">切换模式</button>
        <button class="dbg-btn" id="dbg-spawn-mob">生成怪物</button>
        <button class="dbg-btn" id="dbg-logout" style="margin-left:auto;background:#7f1d1d">登出</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
        <input id="dbg-give-id" class="dbg-input" placeholder="物品ID" />
        <input id="dbg-give-amt" class="dbg-input" placeholder="数量" />
        <button class="dbg-btn dbg-small" id="dbg-give-btn" style="flex:0 0 auto">给予</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
        <input id="dbg-tp-x" class="dbg-input" placeholder="x" />
        <input id="dbg-tp-y" class="dbg-input" placeholder="y" />
        <input id="dbg-tp-z" class="dbg-input" placeholder="z" />
        <button class="dbg-btn dbg-small" id="dbg-tp-btn">传送</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
        <input id="dbg-set-x" class="dbg-input" placeholder="x" />
        <input id="dbg-set-y" class="dbg-input" placeholder="y" />
        <input id="dbg-set-z" class="dbg-input" placeholder="z" />
        <input id="dbg-set-id" class="dbg-input" placeholder="方块ID" />
        <button class="dbg-btn dbg-small" id="dbg-set-btn">设块</button>
      </div>
      <div class="small-note">Tip: 面板受密码保护（会话内免重输）。刷新页面会丢失未保存数据。</div>
    `;

    // 密码弹窗（自定义 DOM，不用 prompt）
    const authModal = document.createElement('div'); authModal.id = 'dbg-auth-modal';
    authModal.innerHTML = `
      <div style="font-weight:700">调试面板 - 密码验证</div>
      <div style="margin-top:6px;color:#9ca3af;font-size:12px">请输入密码以打开调试面板（会话内生效）</div>
      <input id="dbg-auth-input" type="password" placeholder="密码" />
      <div class="row"><button id="dbg-auth-cancel" class="dbg-btn dbg-small" style="background:#374151">取消</button><button id="dbg-auth-ok" class="dbg-btn dbg-small" style="background:#065f46">确定</button></div>
    `;

    root.appendChild(toggle); root.appendChild(panel); document.body.appendChild(root);
    document.body.appendChild(authModal);

    // 元素引用
    const closeEl = panel.querySelector('#dbg-close');
    const coordsEl = panel.querySelector('#dbg-coords');
    const modeEl = panel.querySelector('#dbg-mode');
    const chunksEl = panel.querySelector('#dbg-chunks');
    const hpEl = panel.querySelector('#dbg-hp');
    const btnToggleMode = panel.querySelector('#dbg-toggle-mode');
    const btnSpawnMob = panel.querySelector('#dbg-spawn-mob');
    const btnLogout = panel.querySelector('#dbg-logout');
    const giveId = panel.querySelector('#dbg-give-id');
    const giveAmt = panel.querySelector('#dbg-give-amt');
    const btnGive = panel.querySelector('#dbg-give-btn');
    const tpX = panel.querySelector('#dbg-tp-x'), tpY = panel.querySelector('#dbg-tp-y'), tpZ = panel.querySelector('#dbg-tp-z');
    const btnTp = panel.querySelector('#dbg-tp-btn');
    const setX = panel.querySelector('#dbg-set-x'), setY = panel.querySelector('#dbg-set-y'), setZ = panel.querySelector('#dbg-set-z'), setId = panel.querySelector('#dbg-set-id');
    const btnSet = panel.querySelector('#dbg-set-btn');

    const authInput = document.getElementById('dbg-auth-input');
    const authOk = document.getElementById('dbg-auth-ok');
    const authCancel = document.getElementById('dbg-auth-cancel');

    // helpers
    const isAuthed = () => sessionStorage.getItem(SESSION_KEY) === '1';
    const setAuthed = (v) => { if (v) sessionStorage.setItem(SESSION_KEY, '1'); else sessionStorage.removeItem(SESSION_KEY); };

    // show auth modal
    const showAuthModal = () => {
      authModal.style.display = 'block';
      authInput.value = '';
      authInput.focus();
    };
    const hideAuthModal = () => { authModal.style.display = 'none'; };

    // toggle click: check auth
    toggle.addEventListener('click', () => {
      if (isAuthed()) {
        panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
      } else {
        showAuthModal();
      }
    });

    authCancel.addEventListener('click', () => { hideAuthModal(); });
    authOk.addEventListener('click', () => {
      const val = authInput.value || '';
      // exact match with PASSWORD
      if (val === PASSWORD) {
        setAuthed(true);
        hideAuthModal();
        panel.style.display = 'block';
      } else {
        // 错误反馈（简单闪烁）
        authInput.style.borderColor = '#b91c1c';
        setTimeout(()=>{ authInput.style.borderColor=''; }, 900);
        authInput.focus();
      }
    });

    // also allow Enter key in input
    authInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') authOk.click(); });

    // panel handlers
    closeEl.addEventListener('click', () => { panel.style.display = 'none'; });
    btnToggleMode.addEventListener('click', () => {
      const newMode = (gameMode === 'creative') ? 'survival' : 'creative';
      if (typeof window.gameDebug?.setMode === 'function') window.gameDebug.setMode(newMode);
      else { gameMode = newMode; renderHotbar(); renderInventoryUI(); }
      const flyBtn = document.getElementById('fly-btn'); if (flyBtn) flyBtn.style.display = (newMode === 'creative') ? 'flex' : 'none';
    });
    btnSpawnMob.addEventListener('click', () => {
      if (!player || !scene) return;
      const mob = new THREE.Mesh(new THREE.BoxGeometry(0.8,1.8,0.8), new THREE.MeshLambertMaterial({ color: 0x15803d }));
      mob.position.set(player.position.x + 2, player.position.y + 1, player.position.z + 2);
      mob.userData = { hp:3, lastAttack:0 }; scene.add(mob); mobs.push(mob);
    });

    btnGive.addEventListener('click', () => {
      const id = Number(giveId.value) || 0; const amt = Math.max(1, Number(giveAmt.value) || 1);
      if (!id) return alert('请输入有效物品ID');
      inventory[id] = (inventory[id] || 0) + amt;
      renderHotbar(); renderInventoryUI();
    });

    btnTp.addEventListener('click', () => {
      const x = Number(tpX.value), y = Number(tpY.value), z = Number(tpZ.value);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) && player) { player.position.set(x,y,z); coordsEl.innerText = `${Math.floor(x)}, ${Math.floor(y)}, ${Math.floor(z)}`; }
      else alert('请输入有效坐标并确保玩家已初始化');
    });

    btnSet.addEventListener('click', () => {
      const x = parseInt(setX.value,10), y = parseInt(setY.value,10), z = parseInt(setZ.value,10), id = parseInt(setId.value,10);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(id)) return alert('请输入有效的 x,y,z, id');
      world?.setVoxel(x,y,z,id);
    });

    btnLogout.addEventListener('click', () => { setAuthed(false); panel.style.display = 'none'; alert('已登出，下一次打开需要密码'); });

    // live updater
    const updatePanel = () => {
      if (!player) return;
      coordsEl.innerText = `${Math.floor(player.position.x)}, ${Math.floor(player.position.y)}, ${Math.floor(player.position.z)}`;
      modeEl.innerText = gameMode || '-';
      chunksEl.innerText = world ? (world.chunkMeshes.size || 0) : '0';
      hpEl.innerText = `${hp ?? '-'} / ${MAX_HP ?? '-' }`;
    };
    const updater = setInterval(updatePanel, 300);
    window.addEventListener('beforeunload', () => clearInterval(updater));
    window.addEventListener('keydown', (e) => { if (e.code === 'F3') panel.style.display = panel.style.display === 'block' ? 'none' : 'block'; });
  }; // doInstall end

  // Poll until ready (timeout 30s)
  let tries = 0; const maxTries = 100; const interval = setInterval(() => {
    if (readyCheck()) { clearInterval(interval); try { doInstall(); } catch (err) { console.warn('dbg panel install failed', err); } }
    else { tries++; if (tries >= maxTries) { clearInterval(interval); console.warn('dbg panel: game not ready within timeout'); } }
  }, 300);
})();
