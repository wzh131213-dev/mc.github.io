// game.js - 移动优先（mobile-first）主逻辑
// 说明：基于之前的版本，自动检测移动设备并为手机优化渲染、UI 和控制体验。

/* ========= 设备检测与配置（移动优先） ========= */
const isMobile = (typeof window !== 'undefined') && (
  /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || ('ontouchstart' in window && navigator.maxTouchPoints > 0)
);

// 针对移动设备调整参数（降低开销，增大触控目标）
let CHUNK_SIZE_X = 16, CHUNK_SIZE_Z = 16;
let CHUNK_SIZE_Y = isMobile ? 96 : 124;      // 移动端降低高度
let RENDER_DISTANCE = isMobile ? 1 : 2;      // 移动端更短渲染距离
const MAX_RENDER_PIXEL_RATIO = isMobile ? 1 : Math.min(2, window.devicePixelRatio || 1);

/* ========= 方块定义（保持兼容） ========= */
const BLOCK_DEFS = {
  0: { name: '空气', color: [0xff,0xff,0xff], hardness:0, transparent:true },
  1: { name: '草方块', color: [0x55,0x7a,0x2b], hardness:0.4 },
  2: { name: '泥土',   color: [0x8b,0x5a,0x2b], hardness:0.3 },
  3: { name: '石头',   color: [0x80,0x80,0x80], hardness:1.2, reqTool:'wooden_pickaxe' },
  4: { name: '原木',   color: [0x65,0x43,0x21], hardness:0.8 },
  5: { name: '木块',   color: [0xc4,0x9a,0x45], hardness:0.5 },
  6: { name: '树叶',   color: [0x2e,0x8b,0x57], hardness:0.1, transparent:true },
  8: { name: '基岩',   color: [0x33,0x33,0x33], hardness:999 },
  9: { name: '沙子',   color: [0xdb,0xc6,0x75], hardness:0.3 },
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

/* ========= THREE/渲染/光照 设置（移动端降低开销） ========= */
let scene, camera, renderer;
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
const dayColor = new THREE.Color(0x87ceeb);
const nightColor = new THREE.Color(0x0f172a);

/* ========= 其余全局状态（与原逻辑兼容） ========= */
let world, player, playerMesh;
let isInGame = false, isThirdPerson = false, gameMode = 'creative';
let isFlying = false, flyVerticalState = 0;
let selectedBlockId = 1;
let hotbarSlots = [1,2,3,4,5,6,13,14,20];
let inventory = {1:10,2:10,3:10,4:10,5:10,6:10,13:1,14:1,20:5,22:5};
let heldItem = null; // 拾取/放置
let mobs = [];
let lastSpawnTime = 0;

/* ========= 面与 DDA 射线（保留原实现） ========= */
const FACES = [
  { dir:[0,0,1],  corners:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
  { dir:[0,0,-1], corners:[[1,0,0],[0,0,0],[0,1,0],[1,1,0]] },
  { dir:[0,1,0],  corners:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
  { dir:[0,-1,0], corners:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  { dir:[1,0,0],  corners:[[1,0,1],[1,0,0],[1,1,0],[1,1,1]] },
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

/* ========= 世界管理（生成/网格重建） ========= */
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
    const heights = Array.from({length:CHUNK_SIZE_X},()=>new Array(CHUNK_SIZE_Z).fill(0));
    const biomes = Array.from({length:CHUNK_SIZE_X},()=>new Array(CHUNK_SIZE_Z).fill('plains'));
    for (let lx=0; lx<CHUNK_SIZE_X; lx++) {
      for (let lz=0; lz<CHUNK_SIZE_Z; lz++) {
        const wx = startX + lx, wz = startZ + lz;
        const n1 = this.noise.noise2D(wx*0.015, wz*0.015)*8;
        const n2 = this.noise.noise2D(wx*0.05, wz*0.05)*2;
        const h = Math.floor(78 + n1 + n2);
        heights[lx][lz] = h;
        const tempNoise = this.noise.noise2D(wx*0.006, wz*0.006);
        let biome = 'plains';
        if (tempNoise > 0.25) biome = 'desert';
        else if (tempNoise < -0.2) biome = 'snow';
        biomes[lx][lz] = biome;
        for (let y=0; y<CHUNK_SIZE_Y; y++) {
          const idx = lx + CHUNK_SIZE_X * (lz + CHUNK_SIZE_Z * y);
          if (y === 0) data[idx] = 8;
          else if (y < h - 3) data[idx] = 3;
          else if (y < h) data[idx] = (biome === 'desert') ? 9 : 2;
          else if (y === h) {
            if (biome === 'desert') data[idx]=9;
            else if (biome === 'snow') data[idx] = (h>82)?12:11;
            else data[idx]=1;
          } else {
            data[idx] = 0;
          }
        }
      }
    }

    // 矿物分布（同原逻辑）
    const oreTypes = [23,24,25,26];
    oreTypes.forEach((oreType, oreIndex) => {
      const targetCount = 90;
      const positions = [];
      for (let lx=0; lx<CHUNK_SIZE_X; lx++) {
        for (let lz=0; lz<CHUNK_SIZE_Z; lz++) {
          const maxStoneY = Math.min(CHUNK_SIZE_Y-1, heights[lx][lz]-3);
          const minY = (oreType === 26) ? Math.max(1, 28) : 1;
          for (let y=minY; y<=maxStoneY; y++) {
            const idx = lx + CHUNK_SIZE_X * (lz + CHUNK_SIZE_Z * y);
            if (data[idx] === 3) positions.push({lx,y,lz,idx});
          }
        }
      }
      if (positions.length === 0) return;
      const seed = Math.abs(cx*1572869 ^ cz*3145739 ^ (oreIndex*48271));
      const step = Math.max(1, Math.floor(positions.length / targetCount));
      let startOffset = seed % Math.max(1, step);
      let placed = 0;
      for (let i=0; i<positions.length && placed<targetCount; i+=step) {
        const posIdx = (startOffset + i) % positions.length;
        const pos = positions[posIdx];
        if (data[pos.idx] === 3) { data[pos.idx] = oreType; placed++; }
      }
      for (let i=0; i<positions.length && placed<targetCount; i++) {
        const pos = positions[i];
        if (data[pos.idx] === 3) { data[pos.idx] = oreType; placed++; }
      }
    });

    // 简单树木生成
    const seedRandom = (n) => { const x=Math.sin(n)*10000; return x - Math.floor(x); };
    const treeSeed = Math.abs(cx*73856093 ^ cz*19349663);
    const treeCount = Math.floor(seedRandom(treeSeed)*2) + 1;
    for (let t=0; t<treeCount; t++) {
      const tx = Math.floor(seedRandom(treeSeed + t*10 + 1)*10) + 3;
      const tz = Math.floor(seedRandom(treeSeed + t*10 + 2)*10) + 3;
      if (tx < 0 || tx >= CHUNK_SIZE_X || tz < 0 || tz >= CHUNK_SIZE_Z) continue;
      if (biomes[tx][tz] !== 'plains') continue;
      const th = heights[tx][tz];
      const trunkHeight = 4;
      for (let ty = th+1; ty <= th+trunkHeight && ty < CHUNK_SIZE_Y; ty++) {
        const idx = tx + CHUNK_SIZE_X * (tz + CHUNK_SIZE_Z * ty);
        data[idx] = 4;
      }
      const leafStart = th + trunkHeight - 1;
      const leafEnd = th + trunkHeight + 1;
      for (let ly=leafStart; ly<=leafEnd; ly++) {
        for (let lxOff=-1; lxOff<=1; lxOff++) {
          for (let lzOff=-1; lzOff<=1; lzOff++) {
            const lwx = tx + lxOff, lwz = tz + lzOff;
            if (lwx>=0 && lwx<CHUNK_SIZE_X && lwz>=0 && lwz<CHUNK_SIZE_Z && ly < CHUNK_SIZE_Y) {
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
      if (Array.isArray(old.material)) old.material.forEach(m=>m.dispose());
      else old.material.dispose();
      this.chunkMeshes.delete(key);
    }

    const positions = [], colors = [], indices = [];
    let quadCount = 0;
    const data = this.chunks.get(key);
    const startX = cx * CHUNK_SIZE_X, startZ = cz * CHUNK_SIZE_Z;

    for (let y=0; y<CHUNK_SIZE_Y; y++) {
      for (let lx=0; lx<CHUNK_SIZE_X; lx++) {
        for (let lz=0; lz<CHUNK_SIZE_Z; lz++) {
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

/* ========= 玩家实体（碰撞/运动） ========= */
class PlayerEntity {
  constructor(x,y,z) {
    this.position = new THREE.Vector3(x,y,z);
    this.velocity = new THREE.Vector3(0,0,0);
    this.width = 0.55; this.height = 1.75; this.eyeHeight = 1.6;
    this.onGround = false;
  }
  getAABB(pos = this.position) {
    const halfW = this.width / 2;
    const h = this.height;
    return { minX: pos.x - halfW, maxX: pos.x + halfW, minY: pos.y + 0.001, maxY: pos.y + h, minZ: pos.z - halfW, maxZ: pos.z + halfW };
  }
  checkCollision(aabb) {
    const minX = Math.floor(aabb.minX), maxX = Math.ceil(aabb.maxX);
    const minY = Math.floor(aabb.minY), maxY = Math.ceil(aabb.maxY);
    const minZ = Math.floor(aabb.minZ), maxZ = Math.ceil(aabb.maxZ);
    for (let x=minX; x<maxX; x++) for (let y=minY; y<maxY; y++) for (let z=minZ; z<maxZ; z++) if (world.getVoxel(x,y,z) !== 0) return true;
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
    } else {
      this.position.y += this.velocity.y * delta;
      this.onGround = false;
    }
  }
  jump() {
    if (this.onGround || isFlying) {
      this.velocity.y = Math.sqrt(2 * 35.0 * 20);
      this.onGround = false;
    }
  }
}

/* ========= UI/背包/合成/熔炉 等（保留并优化触控） ========= */
let heldItemGlobal = null;
function renderHotbar() {
  const hotbar = document.getElementById('hotbar'); if (!hotbar) return;
  hotbar.innerHTML = '';
  hotbarSlots.forEach((id, idx) => {
    const def = BLOCK_DEFS[id];
    const slot = document.createElement('div');
    slot.className = 'hotbar-slot' + (selectedBlockId === id ? ' selected' : '');
    slot.dataset.slotIndex = idx;
    if (def) {
      const icon = document.createElement('div'); icon.className = 'slot-icon'; icon.style.backgroundColor = `rgb(${def.color.join(',')})`;
      const name = document.createElement('div'); name.innerText = def.name; name.style.fontSize='11px';
      const count = document.createElement('div'); count.className='slot-count'; count.innerText = isMobile || gameMode==='creative' ? '∞' : (inventory[id]||0);
      slot.appendChild(icon); slot.appendChild(name); slot.appendChild(count);
    } else slot.innerText = '空';
    slot.addEventListener('click', ()=>{ selectedBlockId = id; renderHotbar(); });
    slot.addEventListener('dragover', (e)=>{ e.preventDefault(); slot.classList.add('drag-over'); });
    slot.addEventListener('dragleave', ()=>slot.classList.remove('drag-over'));
    slot.addEventListener('drop', (e)=>{ e.preventDefault(); slot.classList.remove('drag-over'); const draggedId = parseInt(e.dataTransfer.getData('text/plain'),10); if (draggedId) handleSlotDrop(draggedId, idx); });
    hotbar.appendChild(slot);
  });
}

function handleSlotDrop(draggedId, targetSlotIndex) {
  const existingId = hotbarSlots[targetSlotIndex];
  hotbarSlots[targetSlotIndex] = draggedId;
  selectedBlockId = draggedId;
  renderHotbar();
  if (isInventoryOpen) renderInventoryUI();
}

function renderInventoryUI() {
  const hotbarGrid = document.getElementById('inv-hotbar-content');
  if (hotbarGrid) {
    hotbarGrid.innerHTML = '';
    for (let i=0;i<9;i++){
      const id = hotbarSlots[i];
      const def = id ? BLOCK_DEFS[id] : null;
      const slot = document.createElement('div');
      slot.className = 'inv-slot' + (selectedBlockId===id ? ' selected' : '');
      if (def) {
        const icon = document.createElement('div'); icon.className='inv-slot-icon'; icon.style.backgroundColor=`rgb(${def.color.join(',')})`;
        const name = document.createElement('div'); name.className='inv-slot-name'; name.innerText=def.name;
        const count = document.createElement('div'); count.className='inv-slot-count'; count.innerText = (gameMode==='creative' || isMobile) ? '∞' : (inventory[id]||0);
        slot.appendChild(icon); slot.appendChild(name); slot.appendChild(count);
      } else {
        const emptyLabel = document.createElement('span'); emptyLabel.className='inv-slot-name'; emptyLabel.style.opacity=.4; emptyLabel.innerText=`栏 ${i+1}`; slot.appendChild(emptyLabel);
      }
      slot.addEventListener('click', ()=>handleInventorySlotClick(hotbarSlots[i]||null,'hotbar',i));
      hotbarGrid.appendChild(slot);
    }
  }

  const grid = document.getElementById('inv-grid-content'); if (!grid) return;
  grid.innerHTML = '';
  Object.keys(BLOCK_DEFS).forEach(idKey=>{
    const id = Number(idKey); const def = BLOCK_DEFS[id];
    if (!def) return;
    if (def.creativeOnly && gameMode !== 'creative') return;
    const slot = document.createElement('div'); slot.className='inv-slot';
    slot.draggable = true; slot.dataset.itemId = id;
    const icon = document.createElement('div'); icon.className='inv-slot-icon'; icon.style.backgroundColor=`rgb(${def.color.join(',')})`;
    const name = document.createElement('div'); name.className='inv-slot-name'; name.innerText = def.name;
    const count = document.createElement('div'); count.className='inv-slot-count'; count.innerText = (gameMode==='creative' || isMobile) ? '∞' : (inventory[id]||0);
    slot.appendChild(icon); slot.appendChild(name); slot.appendChild(count);
    slot.addEventListener('click', ()=>handleInventorySlotClick(id,'backpack',null));
    slot.addEventListener('dragstart', (e)=>{ e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed='move'; });
    grid.appendChild(slot);
  });

  // 基本合成
  const recipesList = document.getElementById('crafting-recipes-list');
  if (recipesList) {
    recipesList.innerHTML = '';
    const basicRecipes = [
      { name:'🪵 木块 x4 (自原木x1)', cost:{4:1}, give:{5:4} },
      { name:'🪑 工作台 (自木块x4)', cost:{5:4}, give:{13:1} }
    ];
    basicRecipes.forEach(r=>{
      const row = document.createElement('div'); row.className='recipe-row'; row.innerHTML=`<span>${r.name}</span>`;
      let canCraft = true;
      if (gameMode!=='creative') {
        for (let id in r.cost) if ((inventory[id]||0) < r.cost[id]) { canCraft = false; break; }
      }
      const btn = document.createElement('button'); btn.className='recipe-btn'; btn.innerText='合成'; btn.disabled = !canCraft && gameMode!=='creative';
      btn.addEventListener('click', ()=>{
        if (gameMode==='creative' || canCraft) {
          if (gameMode!=='creative') for (let id in r.cost) inventory[id]-=r.cost[id];
          for (let id in r.give) inventory[id] = (inventory[id]||0) + r.give[id];
          renderInventoryUI(); renderHotbar();
        }
      });
      row.appendChild(btn); recipesList.appendChild(row);
    });
  }
}

function handleInventorySlotClick(clickedId, targetType, targetIndex) {
  if (!heldItem) {
    if (targetType === 'backpack') {
      if (clickedId && (gameMode==='creative' || (inventory[clickedId]||0) > 0)) heldItem = { id: clickedId };
    } else if (targetType === 'hotbar') {
      const idInSlot = hotbarSlots[targetIndex]; if (idInSlot) heldItem = { id: idInSlot };
    }
  } else {
    if (targetType === 'hotbar') { hotbarSlots[targetIndex] = heldItem.id; selectedBlockId = heldItem.id; }
    else if (targetType === 'backpack') { if (clickedId) selectedBlockId = clickedId; }
    heldItem = null;
  }
  renderInventoryUI(); renderHotbar();
}

/* ========= 熔炉（保留） ========= */
let furnaceState = { open:false, input:0, inputCount:0, fuel:0, fuelCount:0, output:0, outputCount:0, progress:0, burn:0, maxBurn:0 };
function smeltRecipe(id) {
  if (id===24) return { out:36, count:1 };
  if (id===25) return { out:37, count:1 };
  if (id===4)  return { out:59, count:1 };
  if (id===48) return { out:52, count:1 };
  return null;
}
function fuelValue(id) {
  if (id===39 || id===59) return 1600;
  if (id===27) return 100;
  if ([4,5,13].includes(id)) return 300;
  return 0;
}
function openFurnace() {
  furnaceState.open = true;
  let p = document.getElementById('furnacePanel');
  if (!p) { p = document.createElement('div'); p.id='furnacePanel'; p.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:1200;background:rgba(25,25,25,.97);color:white;border:2px solid #888;border-radius:10px;padding:16px;width:320px;font:14px sans-serif"; document.body.appendChild(p); }
  p.style.display='block'; renderFurnacePanel();
}
function renderFurnacePanel() {
  const p = document.getElementById('furnacePanel'); if (!p) return;
  const prog = Math.min(100, (furnaceState.progress / 100) * 100);
  const burn = Math.min(100, furnaceState.maxBurn ? furnaceState.burn / furnaceState.maxBurn * 100 : 0);
  const nm = id => id ? (BLOCK_DEFS[id]?.name || ("ID " + id)) : "空";
  p.innerHTML = `
    <h3 style="text-align:center;margin:0 0 12px">🔥 熔炉</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
      <div style="background:#444;padding:12px;text-align:center">输入<br><b>${nm(furnaceState.input)}</b><br>${furnaceState.inputCount||''}</div>
      <div style="background:#444;padding:12px;text-align:center">燃料<br><b>${nm(furnaceState.fuel)}</b><br>${furnaceState.fuelCount||''}</div>
      <div style="background:#444;padding:12px;text-align:center">输出<br><b>${nm(furnaceState.output)}</b><br>${furnaceState.outputCount||''}</div>
    </div>
    <div style="height:8px;background:#222;margin:10px 0"><div style="height:100%;width:${prog}%;background:#e0a34b"></div></div>
    <div style="height:8px;background:#222;margin:6px 0"><div style="height:100%;width:${burn}%;background:#d65b35"></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px">
      <button onclick="furnacePutInput()" style="padding:6px;border-radius:4px;cursor:pointer">放入选中物品</button>
      <button onclick="furnacePutFuel()" style="padding:6px;border-radius:4px;cursor:pointer">放入燃料</button>
      <button onclick="furnaceTake()" style="padding:6px;border-radius:4px;cursor:pointer">取出产物</button>
      <button onclick="closeFurnace()" style="padding:6px;border-radius:4px;cursor:pointer">关闭</button>
    </div>`;
}
function furnacePutInput() {
  const id = selectedBlockId, r = smeltRecipe(id);
  if (!r || (inventory[id]||0) <= 0) return;
  if (furnaceState.input && furnaceState.input !== id) return;
  furnaceState.input = id; furnaceState.inputCount++; inventory[id]--; renderInventoryUI(); renderHotbar(); renderFurnacePanel();
}
function furnacePutFuel() {
  const id = selectedBlockId, v = fuelValue(id);
  if (!v || (inventory[id]||0) <= 0) return;
  if (furnaceState.fuel && furnaceState.fuel !== id) return;
  furnaceState.fuel = id; furnaceState.fuelCount++; inventory[id]--; renderInventoryUI(); renderHotbar(); renderFurnacePanel();
}
function furnaceTake() {
  if (!furnaceState.output) return;
  inventory[furnaceState.output] = (inventory[furnaceState.output] || 0) + furnaceState.outputCount;
  furnaceState.output = 0; furnaceState.outputCount = 0; renderFurnacePanel(); renderHotbar(); renderInventoryUI();
}
function closeFurnace() { furnaceState.open=false; const p = document.getElementById('furnacePanel'); if (p) p.style.display='none'; }
function tickFurnace(dt) {
  if (!furnaceState.input || !furnaceState.inputCount) return;
  const r = smeltRecipe(furnaceState.input); if (!r) return;
  if (furnaceState.output && furnaceState.output !== r.out) return;
  if (furnaceState.burn <= 0) {
    const fv = fuelValue(furnaceState.fuel);
    if (!fv || furnaceState.fuelCount <= 0) return;
    furnaceState.burn = fv; furnaceState.maxBurn = fv; furnaceState.fuelCount--;
  }
  furnaceState.burn -= dt * 20; furnaceState.progress += dt * 20;
  if (furnaceState.progress >= 100) {
    furnaceState.progress = 0; furnaceState.inputCount--;
    furnaceState.output = r.out; furnaceState.outputCount++;
    if (furnaceState.inputCount <= 0) furnaceState.input = 0;
  }
  if (furnaceState.open) renderFurnacePanel();
}

/* ========= 挖掘/放置流程（保留并优化） ========= */
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

function handleBlockPlaceAtHit(hitResult) {
  if (!hitResult) return;
  const placeDef = BLOCK_DEFS[selectedBlockId];
  if (!placeDef || placeDef.isItem) return;
  if (gameMode !== 'creative' && !(inventory[selectedBlockId] && inventory[selectedBlockId] > 0)) return;
  const targetAABB = { minX: hitResult.px, maxX: hitResult.px+1, minY: hitResult.py, maxY: hitResult.py+1, minZ: hitResult.pz, maxZ: hitResult.pz+1 };
  const playerAABB = player.getAABB();
  const overlap = !(targetAABB.maxX <= playerAABB.minX || targetAABB.minX >= playerAABB.maxX || targetAABB.maxY <= playerAABB.minY || targetAABB.minY >= playerAABB.maxY || targetAABB.maxZ <= playerAABB.minZ || targetAABB.minZ >= playerAABB.maxZ);
  if (!overlap) {
    world.setVoxel(hitResult.px, hitResult.py, hitResult.pz, selectedBlockId);
    if (gameMode !== 'creative') { inventory[selectedBlockId] = (inventory[selectedBlockId]||0) - 1; renderHotbar(); }
  }
}

/* ========= 输入/触控/摇杆（移动端优先） ========= */
let yaw = 0, pitch = 0;
const keys = {};
let joystickPointerId = null, joystickOrigin = {x:0,y:0}, joystickMove = {x:0,y:0};
let lookPointerId = null, lastLookPos = {x:0,y:0};

function setupUIEvents() {
  document.getElementById('card-creative').addEventListener('click', ()=>startGame('creative'));
  document.getElementById('card-survival').addEventListener('click', ()=>startGame('survival'));
  document.getElementById('respawn-btn').addEventListener('click', respawnPlayer);
  document.getElementById('pause-btn').addEventListener('click', showMainMenu);
  document.getElementById('inv-toggle-btn').addEventListener('click', toggleInventory);
  document.getElementById('inv-close-btn').addEventListener('click', toggleInventory);
  document.getElementById('crafting-table-close-btn').addEventListener('click', toggleCraftingTable);
  document.getElementById('save-btn')?.addEventListener('click', saveGame);
  document.getElementById('view-toggle-btn')?.addEventListener('click', (e)=>{ e.stopPropagation(); toggleThirdPerson(); });

  document.getElementById('nightvision-btn')?.addEventListener('click', ()=>{
    const el = document.getElementById('nightvision-btn'); if (!el) return;
    isNightVisionOn = !isNightVisionOn;
    el.style.background = isNightVisionOn ? 'rgba(34,197,94,.8)' : 'rgba(126,34,206,.8)';
  });

  const breakBtn = document.getElementById('break-btn');
  breakBtn.addEventListener('touchstart',(e)=>{ e.preventDefault(); isBreakBtnHeld = true; }, {passive:false});
  breakBtn.addEventListener('touchend', ()=>{ isBreakBtnHeld = false; });
  breakBtn.addEventListener('touchcancel', ()=>{ isBreakBtnHeld = false; });

  document.getElementById('place-btn').addEventListener('touchstart', (e)=>{ e.preventDefault(); handlePlaceAction(); }, {passive:false});
  document.getElementById('place-btn').addEventListener('click', handlePlaceAction);

  // 飞行按钮
  document.getElementById('fly-btn')?.addEventListener('click', ()=>{
    isFlying = !isFlying;
    document.getElementById('fly-btn').style.background = isFlying ? 'rgba(34,197,94,.8)' : 'rgba(168,85,247,.6)';
    document.getElementById('fly-up-btn').style.display = isFlying ? 'flex' : 'none';
    document.getElementById('fly-down-btn').style.display = isFlying ? 'flex' : 'none';
  });
  const flyUp = document.getElementById('fly-up-btn'); if (flyUp) { flyUp.addEventListener('touchstart',(e)=>{ e.preventDefault(); flyVerticalState = 1; }, {passive:false}); flyUp.addEventListener('touchend', ()=>{ flyVerticalState=0; }); flyUp.addEventListener('mousedown', ()=> flyVerticalState=1); flyUp.addEventListener('mouseup', ()=> flyVerticalState=0); }
  const flyDown = document.getElementById('fly-down-btn'); if (flyDown) { flyDown.addEventListener('touchstart',(e)=>{ e.preventDefault(); flyVerticalState = -1; }, {passive:false}); flyDown.addEventListener('touchend', ()=>{ flyVerticalState=0; }); flyDown.addEventListener('mousedown', ()=> flyVerticalState=-1); flyDown.addEventListener('mouseup', ()=> flyVerticalState=0); }

  // 键盘（桌面优先）
  window.addEventListener('keydown', (e)=>{
    keys[e.code] = true;
    if (e.code === 'KeyE') { if (isCraftingTableOpen) toggleCraftingTable(); else toggleInventory(); }
    if (e.code === 'Space' && player) player.jump();
    if (/^Digit[1-9]$/.test(e.code)) {
      const slot = Number(e.code.slice(-1))-1;
      if (slot >=0 && slot < hotbarSlots.length) { selectedBlockId = hotbarSlots[slot]; renderHotbar(); }
    }
    if (e.code === 'KeyV') toggleThirdPerson();
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight')) isSprinting = true;
    if ((e.code === 'ControlLeft' || e.code === 'ControlRight')) isCrouching = true;
    if (e.code === 'KeyF') consumeSelectedFood();
  });
  window.addEventListener('keyup', (e)=>{ keys[e.code]=false; if (e.code==='ShiftLeft' || e.code==='ShiftRight') isSprinting=false; if (e.code==='ControlLeft' || e.code==='ControlRight') isCrouching=false; });

  // 摇杆（触控）
  const joyZone = document.getElementById('joystick-zone'), joyKnob = document.getElementById('joystick-knob');
  if (joyZone) {
    joyZone.addEventListener('touchstart', (e)=>{ e.preventDefault(); const t = e.targetTouches[0]; joystickPointerId = t.identifier; const rect = joyZone.getBoundingClientRect(); joystickOrigin={ x: rect.left + rect.width/2, y: rect.top + rect.height/2 }; updateJoystick(t.clientX, t.clientY); }, {passive:false});
    joyZone.addEventListener('touchmove', (e)=>{ e.preventDefault(); for (let i=0;i<e.changedTouches.length;i++){ if (e.changedTouches[i].identifier === joystickPointerId) { updateJoystick(e.changedTouches[i].clientX, e.changedTouches[i].clientY); break; } } }, {passive:false});
    const resetJoy = (e)=>{ for (let i=0;i<e.changedTouches.length;i++){ if (e.changedTouches[i].identifier === joystickPointerId) { joystickPointerId=null; joystickMove={x:0,y:0}; if (joyKnob) joyKnob.style.transform='translate(0px,0px)'; break; } } };
    joyZone.addEventListener('touchend', resetJoy); joyZone.addEventListener('touchcancel', resetJoy);
  }
  function updateJoystick(clientX, clientY) {
    let dx = clientX - joystickOrigin.x, dy = clientY - joystickOrigin.y;
    const maxDist = 48; const dist = Math.hypot(dx,dy);
    if (dist > maxDist) { dx = dx/dist * maxDist; dy = dy/dist * maxDist; }
    if (joyKnob) joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    joystickMove = { x: dx / maxDist, y: dy / maxDist };
  }

  // 触摸视角（移动端主控）
  const lookZone = document.getElementById('touch-look-zone');
  if (lookZone) {
    lookZone.addEventListener('touchstart', (e)=>{ const t = e.targetTouches[0]; lookPointerId = t.identifier; lastLookPos = { x:t.clientX, y:t.clientY }; });
    lookZone.addEventListener('touchmove', (e)=>{ for (let i=0;i<e.changedTouches.length;i++){ const t=e.changedTouches[i]; if (t.identifier===lookPointerId){ const dx = t.clientX - lastLookPos.x, dy = t.clientY - lastLookPos.y; yaw -= dx * 0.005; pitch -= dy * 0.005; pitch = Math.max(-Math.PI/2+0.01, Math.min(Math.PI/2-0.01, pitch)); lastLookPos = {x:t.clientX,y:t.clientY}; break; } } });
    const resetLook = (e)=>{ for (let i=0;i<e.changedTouches.length;i++){ if (e.changedTouches[i].identifier===lookPointerId) { lookPointerId=null; break; } } };
    lookZone.addEventListener('touchend', resetLook); lookZone.addEventListener('touchcancel', resetLook);
  }

  // 鼠标移动（仅桌面有效） - 禁用在移动端请求指针锁
  if (!isMobile) {
    window.addEventListener('mousemove', (e)=>{
      if (document.pointerLockElement === document.body) {
        yaw -= e.movementX * 0.003; pitch -= e.movementY * 0.003;
        pitch = Math.max(-Math.PI/2+0.01, Math.min(Math.PI/2-0.01, pitch));
      }
    });
    window.addEventListener('mousedown', (e)=>{
      if (isInGame && !isInventoryOpen && !isCraftingTableOpen) {
        if (document.pointerLockElement !== document.body) document.body.requestPointerLock?.();
        else {
          if (e.button === 0) isLeftMouseDown = true;
          if (e.button === 2) handlePlaceAction();
        }
      }
    });
    window.addEventListener('mouseup', (e)=>{ if (e.button === 0) isLeftMouseDown=false; });
  } else {
    // 移动端：通过触摸按钮进行挖掘，禁用 pointerLock 交互
    window.addEventListener('touchstart', (e)=>{/* 防止触摸导致浏览器弹性 */}, {passive:true});
  }

  // 跳跃按钮（移动）
  const mobileJumpBtn = document.getElementById('mobile-jump-only');
  if (mobileJumpBtn) {
    mobileJumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); if (player) player.jump(); }, { passive:false });
    mobileJumpBtn.addEventListener('click', () => { if (player) player.jump(); });
  }
}

/* ========= 存档/加载（同原） ========= */
const gameSaveKey = 'mini_mc_save_mobile_v1';
function saveGame() {
  try {
    const chunks = {}; for (const [k,v] of world.chunks) chunks[k] = Array.from(v);
    const s = { mode: gameMode, player: player.position.toArray(), yaw, pitch, inventory, hotbarSlots, selectedBlockId, chunks };
    localStorage.setItem(gameSaveKey, JSON.stringify(s));
    if (!isMobile) console.log('存档已保存');
  } catch (e) { console.warn('存档失败', e); }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(gameSaveKey);
    if (!raw) return false;
    const s = JSON.parse(raw);
    gameMode = s.mode || 'survival';
    if (s.player && player) player.position.fromArray(s.player);
    yaw = s.yaw || 0; pitch = s.pitch || 0;
    inventory = Object.assign(inventory, s.inventory || {});
    if (s.hotbarSlots) hotbarSlots = s.hotbarSlots;
    selectedBlockId = s.selectedBlockId || 1;
    world.chunks.clear(); world.chunkMeshes.forEach(m => scene.remove(m)); world.chunkMeshes.clear();
    for (const key of Object.keys(s.chunks || {})) world.chunks.set(key, Uint8Array.from(s.chunks[key]));
    renderHotbar(); renderInventoryUI(); updateWorldChunks();
    return true;
  } catch (e) { console.warn('读取存档失败', e); return false; }
}

/* ========= 启动/世界初始化（移动端降低像素比/抗锯齿） ========= */
function initEngine() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.FogExp2(0x87ceeb, 0.012);
  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);

  // 移动端禁用 antialias，可降低 GPU 开销
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(MAX_RENDER_PIXEL_RATIO);
  document.body.appendChild(renderer.domElement);

  scene.add(ambientLight);
  dirLight.position.set(40,80,40);
  scene.add(dirLight);

  world = new WorldManager();

  // 预生成较小半径区块（移动端更小）
  const spawnChunkRadius = RENDER_DISTANCE;
  for (let cx = -spawnChunkRadius; cx <= spawnChunkRadius; cx++) {
    for (let cz = -spawnChunkRadius; cz <= spawnChunkRadius; cz++) {
      world.generateChunkData(cx, cz);
    }
  }
  for (let cx = -spawnChunkRadius; cx <= spawnChunkRadius; cx++) {
    for (let cz = -spawnChunkRadius; cz <= spawnChunkRadius; cz++) {
      world.rebuildChunkMesh(cx, cz);
    }
  }

  let spawnY = isMobile ? 92 : 95;
  for (let y = CHUNK_SIZE_Y - 2; y >= 1; y--) {
    if (world.getVoxel(0, y, 0) !== 0) { spawnY = y + 1; break; }
  }
  player = new PlayerEntity(0, spawnY, 0);

  playerMesh = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3b82f6 });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xf2c29b });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.9, 0.38), bodyMat); body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), skinMat); head.position.y = 1.7;
  playerMesh.add(body, head); playerMesh.visible = false; scene.add(playerMesh);

  setupUIEvents();
  window.addEventListener('resize', onWindowResize);
}

/* ========= 世界更新/区块加载 ========= */
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

/* ========= 矿工流程更新（同原） ========= */
function resetMiningProcess() { miningTarget=null; miningElapsed=0; const cont=document.getElementById('mining-progress-container'); if (cont) cont.style.display='none'; }
function updateMiningProcess(delta) {
  const dir = new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw)*Math.cos(pitch)).normalize();
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
        const drops = ({23:39,24:36,25:37,26:38})[voxelType] || voxelType;
        inventory[drops] = (inventory[drops]||0) + 1;
        renderHotbar();
        resetMiningProcess();
      }
    } else {
      miningTarget = { x:hitResult.x, y:hitResult.y, z:hitResult.z };
      miningElapsed = 0;
      miningTotalTime = getBlockBreakTime(voxelType, selectedBlockId);
    }
  } else resetMiningProcess();
}

/* ========= 放置 / 交互入口 ========= */
function handlePlaceAction() {
  if (!isInGame || isInventoryOpen || isCraftingTableOpen || !player) return;
  const dir = new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw)*Math.cos(pitch)).normalize();
  const eyePos = player.position.clone(); eyePos.y += player.eyeHeight;
  const hitResult = raycastVoxelDDA(eyePos, dir, 6.0);
  if (hitResult.hit) {
    const voxelTypeHit = world.getVoxel(hitResult.x, hitResult.y, hitResult.z);
    if (voxelTypeHit === 13) { toggleCraftingTable(); return; }
    if (voxelTypeHit === 14) { openFurnace(); return; }
    if (voxelTypeHit === 60) { /* chest placeholder */ return; }
    handleBlockPlaceAtHit(hitResult);
  }
}
function handleInstantBreak() {
  const dir = new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw)*Math.cos(pitch)).normalize();
  const eyePos = player.position.clone(); eyePos.y += player.eyeHeight;
  const hitResult = raycastVoxelDDA(eyePos, dir, 6.0);
  if (hitResult.hit) {
    const voxelTypeHit = world.getVoxel(hitResult.x, hitResult.y, hitResult.z);
    if (voxelTypeHit !== 8) world.setVoxel(hitResult.x, hitResult.y, hitResult.z, 0);
  }
}

/* ========= 引擎循环 / 昼夜 / 怪物 / 饥饿等 ========= */
let lastTime = performance.now();
let frameCount = 0, fpsTime = 0;
let isLeftMouseDown = false, isBreakBtnHeld = false, creativeBreakCooldown = 0;
let isSprinting = false, isCrouching = false, isInventoryOpen = false, isCraftingTableOpen = false;
let isNightVisionOn = false;
const MAX_HP = 20, MAX_HUNGER = 100;
let hp = MAX_HP, hunger = MAX_HUNGER, hungerTimer = 0, starvationTimer = 0;
let dayTime = 0, survivalDays = 1;
const DAY_DURATION = 120.0;

function updateDayNightCycle(delta) {
  const old = dayTime;
  dayTime = (dayTime + delta / DAY_DURATION) % 1;
  if (dayTime < old) { survivalDays++; document.getElementById('day-count-val').innerText = survivalDays; }
  const angle = dayTime * Math.PI * 2;
  dirLight.position.x = Math.cos(angle) * 100; dirLight.position.y = Math.sin(angle) * 100; dirLight.position.z = Math.sin(angle) * 30;
  const sunHeight = Math.sin(angle);
  let periodText = '白天';
  if (sunHeight > 0.2) { scene.background.copy(dayColor); scene.fog.color.copy(dayColor); dirLight.intensity=0.8; ambientLight.intensity=0.7; periodText='白天'; }
  else if (sunHeight > -0.2) { dirLight.intensity=0.4; ambientLight.intensity=0.3; periodText = sunHeight>0 ? '黄昏' : '傍晚'; }
  else { scene.background.copy(nightColor); scene.fog.color.copy(nightColor); dirLight.intensity=0.15; ambientLight.intensity=0.15; periodText='夜晚'; }
  if (isNightVisionOn) { scene.background.copy(dayColor); scene.fog.color.copy(dayColor); dirLight.intensity=1.2; ambientLight.intensity=1.0; }
  document.getElementById('time-period-val').innerText = periodText;

  if (gameMode === 'survival') {
    const isNight = sunHeight < -0.2;
    const now = performance.now();
    if (!isNight && mobs.length > 0) { mobs.forEach(m=>scene.remove(m)); mobs.length = 0; }
    if (isNight && now - lastSpawnTime > 7000) {
      lastSpawnTime = now;
      if (mobs.length < 15) {
        const angle = Math.random() * Math.PI * 2; const dist = 14 + Math.random() * 10;
        const sx = player.position.x + Math.cos(angle) * dist; const sz = player.position.z + Math.sin(angle) * dist;
        const sy = Math.max(1, Math.floor(world.getVoxel(Math.floor(sx), 100, Math.floor(sz)) ? 100 : 80));
        const mobGeometry = new THREE.BoxGeometry(0.8,1.8,0.8);
        const mobMaterial = new THREE.MeshLambertMaterial({ color:0x15803d });
        const mob = new THREE.Mesh(mobGeometry, mobMaterial); mob.position.set(sx, sy+2, sz); mob.userData = { hp:3, lastAttack:0 };
        scene.add(mob); mobs.push(mob);
      }
    }
    for (let i=mobs.length-1;i>=0;i--) {
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
  if (hungerTimer >= 16) { hungerTimer = 0; if (hunger > 0) { hunger = Math.max(0, hunger-1); updateHungerUI(); } }
  if (hunger === 0) { starvationTimer += delta; if (starvationTimer >= 10) { starvationTimer = 0; takeDamage(1); } }
}
function takeDamage(amt) { if (gameMode !== 'survival' || hp <= 0) return; hp = Math.max(0, hp-amt); updateHealthUI(); if (hp <= 0) { isInGame=false; document.getElementById('death-screen').style.display='flex'; document.getElementById('crosshair').style.display='none'; resetMiningProcess(); } }
function updateHealthUI() { const bar = document.getElementById('health-bar'); if (!bar) return; bar.innerHTML=''; const hearts = Math.ceil(hp/2); for (let i=0;i<MAX_HP/2;i++){ const h=document.createElement('span'); h.className='heart-unit'; h.innerText = i<hearts ? '❤️' : '🖤'; bar.appendChild(h); } }
function updateHungerUI() { const fill = document.getElementById('hunger-bar-fill'), text = document.getElementById('hunger-val-text'); const pct = (hunger / MAX_HUNGER) * 100; if (fill) fill.style.width = pct + '%'; if (text) text.innerText = `${hunger}/${MAX_HUNGER}`; }
function consumeSelectedFood() {
  if (!isInGame || gameMode !== 'survival') return;
  const def = BLOCK_DEFS[selectedBlockId];
  if (!def || !def.food || (inventory[selectedBlockId]||0) <= 0) return;
  if (hunger >= MAX_HUNGER) return;
  hunger = Math.min(MAX_HUNGER, hunger + def.food * 10); hp = Math.min(MAX_HP, hp + 2);
  inventory[selectedBlockId]--; starvationTimer = 0; hungerTimer = 0; updateHungerUI(); updateHealthUI(); renderHotbar(); renderInventoryUI();
}

/* ========= 动画循环（降低移动端渲染压力） ========= */
let lastAnimTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const delta = Math.min((now - lastAnimTime) / 1000, 0.1);
  lastAnimTime = now;

  frameCount++; fpsTime += delta;
  if (fpsTime >= 1.0) {
    document.getElementById('fps-val').innerText = Math.round(frameCount / fpsTime);
    document.getElementById('chunk-val').innerText = world ? world.chunkMeshes.size : 0;
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
      const inputX = moveVec.x, inputZ = moveVec.z;
      const worldDir = new THREE.Vector3().addScaledVector(right, inputX).addScaledVector(forward, -inputZ).normalize();
      moveVec.x = worldDir.x * speed; moveVec.z = worldDir.z * speed;
    }

    player.update(delta, moveVec);

    if (playerMesh) { playerMesh.position.copy(player.position); playerMesh.rotation.y = yaw; }
    if (isThirdPerson) {
      const dist = 4.0;
      const camX = player.position.x + Math.sin(yaw) * Math.cos(pitch) * dist;
      const camY = player.position.y + player.eyeHeight - Math.sin(pitch) * dist;
      const camZ = player.position.z + Math.cos(yaw) * Math.cos(pitch) * dist;
      camera.position.set(camX, camY, camZ);
      camera.lookAt(player.position.x, player.position.y + player.eyeHeight, player.position.z);
    } else {
      camera.position.set(player.position.x, player.position.y + player.eyeHeight, player.position.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.y = yaw; camera.rotation.x = pitch;
    }

    document.getElementById('coords-val').innerText = `${Math.floor(player.position.x)}, ${Math.floor(player.position.y)}, ${Math.floor(player.position.z)}`;

    updateWorldChunks();
    updateDayNightCycle(delta);
    updateHungerAndHealth(delta);
    tickFurnace(delta);

    if (isLeftMouseDown || isBreakBtnHeld) {
      if (gameMode === 'creative') {
        creativeBreakCooldown -= delta;
        if (creativeBreakCooldown <= 0) { handleInstantBreak(); creativeBreakCooldown = 0.12; }
      } else updateMiningProcess(delta);
    } else resetMiningProcess();
  }

  renderer.render(scene, camera);
}

/* ========= 窗口处理 ========= */
function onWindowResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ========= UI 控制（显示/隐藏） ========= */
function startGame(mode) {
  gameMode = mode; isInGame = true;
  document.getElementById('main-menu').classList.add('hidden');
  document.getElementById('in-game-ui').classList.remove('hidden');
  document.getElementById('crosshair').style.display = isThirdPerson ? 'none' : 'block';
  if (playerMesh) playerMesh.visible = isThirdPerson;
  document.getElementById('status-container').style.display = mode === 'survival' ? 'flex' : 'none';
  document.getElementById('fly-btn').style.display = mode === 'creative' ? 'flex' : 'none';
  renderHotbar(); renderInventoryUI();
}
function respawnPlayer() { document.getElementById('death-screen').style.display = 'none'; player.position.set(0, isMobile ? 92 : 95, 0); player.velocity.set(0,0,0); hp = MAX_HP; hunger = MAX_HUNGER; isInGame = true; document.getElementById('crosshair').style.display = isThirdPerson ? 'none' : 'block'; if (playerMesh) playerMesh.visible = isThirdPerson; updateHealthUI(); updateHungerUI(); }
function showMainMenu() { isInGame = false; document.getElementById('main-menu').classList.remove('hidden'); document.getElementById('in-game-ui').classList.add('hidden'); document.getElementById('crosshair').style.display = 'none'; if (playerMesh) playerMesh.visible = false; }
function toggleInventory() {
  if (isCraftingTableOpen) return;
  isInventoryOpen = !isInventoryOpen; heldItem = null;
  const modal = document.getElementById('inventory-modal');
  modal.style.display = isInventoryOpen ? 'flex' : 'none';
  if (isInventoryOpen) { if (document.pointerLockElement) document.exitPointerLock?.(); renderInventoryUI(); resetMiningProcess(); }
}
function toggleCraftingTable() {
  if (isInventoryOpen) return;
  isCraftingTableOpen = !isCraftingTableOpen;
  const modal = document.getElementById('crafting-table-modal');
  modal.style.display = isCraftingTableOpen ? 'flex' : 'none';
  if (isCraftingTableOpen) { if (document.pointerLockElement) document.exitPointerLock?.(); renderCraftingTableUI(); resetMiningProcess(); }
}
function toggleThirdPerson() { isThirdPerson = !isThirdPerson; document.getElementById('crosshair').style.display = isThirdPerson ? 'none' : 'block'; if (playerMesh) playerMesh.visible = isThirdPerson; }

/* ========= 渲染与启动 ========= */
initEngine();
setupUIEvents();
renderHotbar();
renderInventoryUI();
animate();

// 尝试自动加载存档（若存在）
loadGame();

// 暴露一些调试接口
window.world = world; window.player = player; window.saveGame = saveGame; window.loadGame = loadGame;
window.openFurnace = openFurnace; window.closeFurnace = closeFurnace;
