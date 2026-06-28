// NEON STRIKE — a compact 2D stickman fighter
// Canvas-rendered. Local 2-player. Bullet time. Weapon pickups.
import { useEffect, useRef, useState } from "react";

type Vec = { x: number; y: number };
type WeaponKind = "fists" | "katana" | "pistol" | "shotgun" | "rocket" | "spear" | "mace";
type PlayerClass = "ninja" | "samurai" | "warden";

interface Weapon {
  kind: WeaponKind;
  ammo: number; // -1 = infinite
  cooldown: number;
}

interface Player {
  id: 0 | 1;
  pos: Vec;
  vel: Vec;
  w: number;
  h: number;
  facing: 1 | -1;
  onGround: boolean;
  jumps: number;
  dashCd: number;
  slideTimer: number;
  hp: number;
  energy: number; // 0..100 for bullet time
  weapon: Weapon;
  attackTimer: number;
  hitFlash: number;
  color: string;
  glow: string;
  wins: number;
  invuln: number;
  swingDir: 1 | -1;
  comboStep: number;
  comboTimer: number;
  // Expansion fields:
  class: PlayerClass;
  stamina: number; // 0..100
  stunTimer: number;
  blocking: boolean;
  powerupType: "rage" | "shield" | null;
  powerupTimer: number;
  maxHp: number;
  speedMultiplier: number;
}

interface Bullet {
  pos: Vec;
  vel: Vec;
  owner: 0 | 1;
  life: number;
  dmg: number;
  trail: Vec[];
  color: string;
  isRocket?: boolean;
}

interface Pickup {
  pos: Vec;
  kind: WeaponKind;
  bob: number;
}

interface Powerup {
  pos: Vec;
  vel: Vec;
  kind: "healing" | "rage" | "shield";
  bob: number;
}

interface Particle {
  pos: Vec;
  vel: Vec;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  gravity?: boolean;
  type?: "leaf" | "splinter" | "dust" | "spark" | "blood" | "star"; // Added star for stun
  rotSpeed?: number;
}

interface Platform {
  x: number; y: number; w: number; h: number;
  moving?: { axis: "x" | "y"; range: number; speed: number; t: number; origin: number };
}

const W = 1280;
const H = 720;
const GRAVITY = 1800;
const MOVE_SPEED = 380;
const JUMP_V = 720;
const DASH_V = 1100;

const WEAPON_DEFS: Record<WeaponKind, { name: string; ammo: number; color: string }> = {
  fists:   { name: "FISTS",           ammo: -1, color: "#a1887f" },
  katana:  { name: "KATANA",          ammo: -1, color: "#b0bec5" },
  pistol:  { name: "PISTOL",          ammo: 12, color: "#8d6e63" },
  shotgun: { name: "SHOTGUN",         ammo: 6,  color: "#5d4037" },
  rocket:  { name: "ROCKET LAUNCHER", ammo: 3,  color: "#3e2723" },
  spear:   { name: "SPEAR",           ammo: -1, color: "#90a4ae" },
  mace:    { name: "STONE MACE",      ammo: -1, color: "#78909c" },
};

function rand(a: number, b: number) { return a + Math.random() * (b - a); }

export function StickFightGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [scoreTick, setScoreTick] = useState(0);
  
  const [charSelectActive, setCharSelectActive] = useState(true);
  const [p1Class, setP1Class] = useState<PlayerClass>("ninja");
  const [p2Class, setP2Class] = useState<PlayerClass>("ninja");
  const [mode, setMode] = useState<"pvp" | "vs_ai" | "training">("pvp");

  // Persistent game state in a ref so React doesn't re-render every frame
  const stateRef = useRef({
    players: [] as Player[],
    bullets: [] as Bullet[],
    pickups: [] as Pickup[],
    particles: [] as Particle[],
    platforms: [] as Platform[],
    powerups: [] as Powerup[],
    keys: new Set<string>(),
    keysPressed: new Set<string>(),
    shake: 0,
    timeScale: 1,
    targetTimeScale: 1,
    bulletTimeActive: [false, false] as [boolean, boolean],
    roundOver: false,
    roundOverTimer: 0,
    winnerText: "",
    // Expansion properties:
    gameMode: "pvp" as "pvp" | "vs_ai" | "training",
    roundWins: [0, 0] as [number, number],
    currentRound: 1,
    p1SelectedClass: "ninja" as PlayerClass,
    p2SelectedClass: "ninja" as PlayerClass,
    characterSelectActive: true,
  });

  // Init level
  const initRound = () => {
    const s = stateRef.current;
    s.bullets = [];
    s.particles = [];
    s.powerups = [];
    s.targetTimeScale = 1;
    s.timeScale = 1;
    s.bulletTimeActive = [false, false];
    s.keys.clear();
    s.keysPressed.clear();
    s.pickups = [
      { pos: { x: 180, y: 380 }, kind: "katana", bob: 0 },
      { pos: { x: 1100, y: 380 }, kind: "pistol", bob: 1 },
      { pos: { x: 380, y: 200 }, kind: "spear", bob: 2 },
      { pos: { x: 900, y: 200 }, kind: "mace", bob: 3 },
      { pos: { x: 640, y: 200 }, kind: "shotgun", bob: 4 },
      { pos: { x: 640, y: 400 }, kind: "rocket", bob: 5 },
    ];
    s.platforms = [
      { x: 0, y: H - 60, w: W, h: 60 }, // floor
      { x: 150, y: 480, w: 220, h: 18 },
      { x: 910, y: 480, w: 220, h: 18 },
      { x: 540, y: 320, w: 200, h: 18, moving: { axis: "y", range: 80, speed: 1.2, t: 0, origin: 320 } },
      { x: 80, y: 280, w: 140, h: 18 },
      { x: 1060, y: 280, w: 140, h: 18 },
    ];
    s.players = [
      makePlayer(0, 200, H - 200, "#2e7d32", "rgba(46, 125, 50, 0.2)", s.p1SelectedClass),
      makePlayer(1, W - 230, H - 200, "#d84315", "rgba(216, 67, 21, 0.2)", s.p2SelectedClass),
    ];
    
    // Preserve match round wins
    s.players[0].wins = s.roundWins[0];
    s.players[1].wins = s.roundWins[1];
    
    s.roundOver = false;
    s.roundOverTimer = 0;
    s.winnerText = "";
  };

  const makePlayer = (id: 0 | 1, x: number, y: number, color: string, glow: string, pClass: PlayerClass): Player => {
    let maxHp = 100;
    let speedMultiplier = 1.0;
    if (pClass === "warden") {
      maxHp = 125;
      speedMultiplier = 0.9;
    } else if (pClass === "ninja") {
      speedMultiplier = 1.05;
    }
    
    return {
      id,
      pos: { x, y },
      vel: { x: 0, y: 0 },
      w: 22, h: 60,
      facing: id === 0 ? 1 : -1,
      onGround: false,
      jumps: 2,
      dashCd: 0,
      slideTimer: 0,
      hp: maxHp,
      energy: 100,
      weapon: { kind: "fists", ammo: -1, cooldown: 0 },
      attackTimer: 0,
      hitFlash: 0,
      color, glow,
      wins: 0,
      invuln: 0.5,
      swingDir: 1,
      comboStep: 0,
      comboTimer: 0,
      // Expansion fields
      class: pClass,
      stamina: 100,
      stunTimer: 0,
      blocking: false,
      powerupType: null,
      powerupTimer: 0,
      maxHp,
      speedMultiplier,
    };
  };

  useEffect(() => {
    if (!started || charSelectActive) return;
    initRound();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const s = stateRef.current;

    const onKey = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (down) {
        if (!s.keys.has(k)) s.keysPressed.add(k);
        s.keys.add(k);
      } else {
        s.keys.delete(k);
      }
      // prevent page scroll
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dtReal = Math.min(0.033, (now - last) / 1000);
      last = now;
      step(dtReal);
      render(ctx);
      s.keysPressed.clear();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, charSelectActive]);

  function controls(p: Player) {
    const s = stateRef.current;
    if (p.id === 0) {
      return {
        left: s.keys.has("a"), right: s.keys.has("d"),
        up: s.keys.has("w"), down: s.keys.has("s"),
        jumpPressed: s.keysPressed.has("w"),
        dashPressed: s.keysPressed.has("shift") || s.keysPressed.has("q"),
        attackPressed: s.keysPressed.has("f"),
        attackHeld: s.keys.has("f"),
        slowmoPressed: s.keysPressed.has("e"),
        slowmoHeld: s.keys.has("e"),
        pickupPressed: s.keysPressed.has("s"),
      };
    }
    return {
      left: s.keys.has("ArrowLeft"), right: s.keys.has("ArrowRight"),
      up: s.keys.has("ArrowUp"), down: s.keys.has("ArrowDown"),
      jumpPressed: s.keysPressed.has("ArrowUp"),
      dashPressed: s.keysPressed.has("/") || s.keysPressed.has("Shift"),
      attackPressed: s.keysPressed.has("."),
      attackHeld: s.keys.has("."),
      slowmoPressed: s.keysPressed.has(","),
      slowmoHeld: s.keys.has(","),
      pickupPressed: s.keysPressed.has("ArrowDown"),
    };
  }

  function spawnParticles(x: number, y: number, count: number, color: string, speed = 200, opts: Partial<Particle> = {}) {
    const s = stateRef.current;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(speed * 0.3, speed);
      s.particles.push({
        pos: { x, y },
        vel: { x: Math.cos(a) * sp, y: Math.sin(a) * sp - 50 },
        life: rand(0.4, 0.9),
        maxLife: 0.9,
        color,
        size: rand(2.5, 5),
        gravity: true,
        rotSpeed: rand(-0.5, 0.5),
        ...opts,
      });
    }
  }

  function fire(p: Player) {
    const s = stateRef.current;
    if (p.weapon.cooldown > 0 || p.stunTimer > 0) return;
    const muzzleX = p.pos.x + p.facing * 26;
    const muzzleY = p.pos.y - p.h * 0.45;
    switch (p.weapon.kind) {
      case "fists": {
        p.weapon.cooldown = 0.35;
        p.attackTimer = 0.18;
        const other = s.players[1 - p.id];
        const dx = other.pos.x - p.pos.x;
        const dy = other.pos.y - p.pos.y;
        if (Math.abs(dx) < 60 && Math.abs(dy) < 50 && Math.sign(dx) === p.facing) {
          damage(other, 8, p.facing * 350, -200, p);
        }
        break;
      }
      case "katana": {
        if (p.comboTimer > 0) {
          p.comboStep = (p.comboStep + 1) % 3;
        } else {
          p.comboStep = 0;
        }
        p.comboTimer = 0.6;
        
        p.weapon.cooldown = p.comboStep === 2 ? 0.45 : 0.28;
        p.attackTimer = 0.22;
        
        const other = s.players[1 - p.id];
        const dx = other.pos.x - p.pos.x;
        const dy = other.pos.y - p.pos.y;
        
        const isFinisher = p.comboStep === 2;
        const dmg = isFinisher ? 35 : 22;
        const kx = p.facing * (isFinisher ? 700 : 450);
        const ky = isFinisher ? 150 : -200;
        
        const rangeX = isFinisher ? 100 : 85;
        const rangeY = isFinisher ? 70 : 55;
        
        if (Math.abs(dx) < rangeX && Math.abs(dy) < rangeY && Math.sign(dx) === p.facing) {
          damage(other, dmg, kx, ky, p);
          if (isFinisher) {
            s.shake = Math.max(s.shake, 12);
            spawnParticles(other.pos.x, other.pos.y - 30, 15, "#ff9800", 450, { type: "leaf" });
            spawnParticles(other.pos.x, other.pos.y - 30, 10, "#8d6e63", 350, { type: "splinter" });
          } else {
            spawnParticles(other.pos.x, other.pos.y - 30, 8, "#90a4ae", 400, { type: "dust" });
            spawnParticles(other.pos.x, other.pos.y - 30, 8, p.color, 300, { type: "leaf" });
          }
        }
        spawnParticles(muzzleX, muzzleY, 8, p.comboStep === 2 ? "#ff9800" : (p.comboStep === 1 ? "#4caf50" : p.color), 250, { type: "leaf" });
        break;
      }
      case "pistol": {
        if (p.weapon.ammo <= 0) { p.weapon = { kind: "fists", ammo: -1, cooldown: 0.2 }; return; }
        p.weapon.cooldown = 0.22;
        p.weapon.ammo--;
        p.vel.x -= p.facing * 100;
        s.bullets.push({
          pos: { x: muzzleX, y: muzzleY },
          vel: { x: p.facing * 1300, y: rand(-50, 50) },
          owner: p.id, life: 0.8, dmg: 16, trail: [], color: "#bcaaa4",
        });
        s.shake = Math.max(s.shake, 3);
        spawnParticles(muzzleX, muzzleY, 4, "#8d6e63", 250, { type: "splinter", gravity: false });
        break;
      }
      case "shotgun": {
        if (p.weapon.ammo <= 0) { p.weapon = { kind: "fists", ammo: -1, cooldown: 0.2 }; return; }
        p.weapon.cooldown = 0.7;
        p.weapon.ammo--;
        p.vel.x -= p.facing * 220;
        for (let i = 0; i < 8; i++) {
          s.bullets.push({
            pos: { x: muzzleX, y: muzzleY },
            vel: { x: p.facing * rand(900, 1200), y: rand(-260, 260) },
            owner: p.id, life: 0.4, dmg: 9, trail: [], color: "#5d4037",
          });
        }
        s.shake = Math.max(s.shake, 10);
        spawnParticles(muzzleX, muzzleY, 12, "#8d6e63", 350, { type: "splinter", gravity: false });
        break;
      }
      case "rocket": {
        if (p.weapon.ammo <= 0) { p.weapon = { kind: "fists", ammo: -1, cooldown: 0.2 }; return; }
        p.weapon.cooldown = 1.0;
        p.weapon.ammo--;
        p.vel.x -= p.facing * 350;
        s.bullets.push({
          pos: { x: muzzleX, y: muzzleY },
          vel: { x: p.facing * 500, y: 0 },
          owner: p.id, life: 3.0, dmg: 40, trail: [], color: "#ff5722",
          isRocket: true,
        });
        s.shake = Math.max(s.shake, 14);
        spawnParticles(muzzleX, muzzleY, 8, "#d84315", 300, { type: "splinter", gravity: false });
        break;
      }
      case "spear": {
        p.weapon.cooldown = 0.24;
        p.attackTimer = 0.15;
        const other = s.players[1 - p.id];
        const dx = other.pos.x - p.pos.x;
        const dy = other.pos.y - p.pos.y;
        if (Math.abs(dx) < 125 && Math.abs(dy) < 30 && Math.sign(dx) === p.facing) {
          damage(other, 18, p.facing * 300, -100, p);
          spawnParticles(other.pos.x, other.pos.y - 30, 6, "#90a4ae", 350, { type: "splinter" });
        }
        spawnParticles(muzzleX, muzzleY, 3, "#90a4ae", 150, { type: "dust" });
        break;
      }
      case "mace": {
        p.weapon.cooldown = 0.70;
        p.attackTimer = 0.35;
        const other = s.players[1 - p.id];
        const dx = other.pos.x - p.pos.x;
        const dy = other.pos.y - p.pos.y;
        if (Math.abs(dx) < 95 && Math.abs(dy) < 80 && Math.sign(dx) === p.facing) {
          damage(other, 45, p.facing * 800, -350, p);
          s.shake = Math.max(s.shake, 16);
          spawnParticles(other.pos.x, other.pos.y - 30, 16, "#78909c", 400, { type: "splinter" });
          spawnParticles(other.pos.x, other.pos.y - 30, 10, "#a1887f", 300, { type: "dust" });
        }
        spawnParticles(muzzleX, muzzleY, 8, "#78909c", 200, { type: "dust" });
        break;
      }
    }
  }

  function damage(p: Player, dmg: number, kx: number, ky: number, attacker?: Player) {
    if (p.invuln > 0) return;
    const s = stateRef.current;
    
    // Scale damage if attacker has rage active
    if (attacker && attacker.powerupType === "rage") {
      dmg = Math.round(dmg * 1.5);
    }
    
    // Shield bubble powerup negates one damage instance entirely
    if (p.powerupType === "shield") {
      p.powerupType = null;
      p.powerupTimer = 0;
      s.shake = Math.max(s.shake, 6);
      spawnParticles(p.pos.x, p.pos.y - 30, 12, "#78909c", 250, { type: "spark" });
      return;
    }
    
    // Direction check for active block
    const dmgFromLeft = kx > 0;
    const facingLeft = p.facing === -1;
    const facingDamageSource = (dmgFromLeft && !facingLeft) || (!dmgFromLeft && facingLeft);
    
    if (p.blocking && facingDamageSource) {
      const blockedDmg = Math.round(dmg * 0.2); // 80% reduction
      p.stamina = Math.max(0, p.stamina - dmg * 0.8);
      p.hp -= blockedDmg;
      p.vel.x += kx * 0.15; // heavily reduced knockback
      p.vel.y += ky * 0.15;
      p.hitFlash = 0.15;
      s.shake = Math.max(s.shake, 3);
      spawnParticles(p.pos.x, p.pos.y - 30, 8, "#b0bec5", 200, { type: "spark" });
      
      if (p.stamina <= 0) {
        p.blocking = false;
        p.stunTimer = 0.8;
        spawnParticles(p.pos.x, p.pos.y - 40, 10, "#ffeb3b", 300, { type: "star" });
      }
      return;
    }
    
    // Normal damage application
    p.hp -= dmg;
    p.vel.x += kx;
    p.vel.y += ky;
    p.hitFlash = 0.25;
    s.shake = Math.max(s.shake, Math.min(18, dmg * 0.6));
    spawnParticles(p.pos.x, p.pos.y - 30, Math.min(15, dmg / 2), "#8d6e63", 300, { type: "splinter" });
    spawnParticles(p.pos.x, p.pos.y - 30, Math.min(15, dmg / 2), p.color, 300, { type: "leaf" });
    
    if (p.hp <= 0 && !s.roundOver) {
      s.roundOver = true;
      s.roundOverTimer = 2.5;
      s.targetTimeScale = 0.15;
      const winner = s.players[1 - p.id];
      s.roundWins[winner.id]++;
      
      if (s.roundWins[winner.id] >= 3) {
        s.winnerText = `PLAYER ${winner.id + 1} WINS THE MATCH!`;
        s.roundWins = [0, 0];
        s.currentRound = 1;
      } else {
        s.winnerText = `PLAYER ${winner.id + 1} WINS ROUND ${s.currentRound}`;
        s.currentRound++;
      }
      
      setScoreTick(t => t + 1);
      // big explosion: wood splinters and leaves
      spawnParticles(p.pos.x, p.pos.y - 30, 40, "#8d6e63", 500, { type: "splinter" });
      spawnParticles(p.pos.x, p.pos.y - 30, 40, p.color, 400, { type: "leaf" });
    }
  }
  
  // Yapay Zekâ Bot Kontrol Mekanizması (VS AI Modu)
  function updateAI(bot: Player, dtReal: number) {
    const s = stateRef.current;
    // Eğer raunt bittiyse, bot öldüyse ya da sersemlemiş durumdaysa işlem yapma
    if (s.roundOver || bot.hp <= 0 || bot.stunTimer > 0) return;
    
    const target = s.players[0]; // Hedef oyuncu (Player 1)
    if (target.hp <= 0) return;
    
    // Her karede botun bir önceki karedeki tüm girdi tuşlarını sıfırla
    s.keys.delete("ArrowLeft");
    s.keys.delete("ArrowRight");
    s.keys.delete("ArrowUp");
    s.keys.delete("ArrowDown");
    s.keys.delete(",");
    s.keys.delete(".");
    s.keys.delete("/");
    s.keysPressed.delete("ArrowUp");
    s.keysPressed.delete("ArrowDown");
    s.keysPressed.delete(".");
    s.keysPressed.delete("/");
    
    // Varsayılan hedef koordinatlar oyuncunun (P1) pozisyonudur
    let targetX = target.pos.x;
    let targetY = target.pos.y;
    
    // Botun elinde silah yoksa (fists ise) yerdeki silahları aramaya karar ver
    let seekItem = bot.weapon.kind === "fists";
    
    // Eğer canı %75'in altındaysa ve haritada şifa parşömeni varsa onu almaya öncelik ver
    const healingScroll = s.powerups.find(po => po.kind === "healing");
    if (bot.hp < 75 && healingScroll) {
      seekItem = true;
    }
    
    // Silah arama veya Şifa alma durumu aktifse en yakın ögeyi bul
    if (seekItem) {
      let closestDist = 9999;
      let bestX = -1;
      let bestY = -1;
      
      // Sahnedeki tüm silah kutularını (pickup) gez ve Öklid mesafesini hesapla
      for (const pk of s.pickups) {
        const dx = pk.pos.x - bot.pos.x;
        const dy = pk.pos.y - bot.pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < closestDist) {
          closestDist = dist;
          bestX = pk.pos.x;
          bestY = pk.pos.y;
        }
      }
      
      // Sahnedeki tüm düşen parşömenleri (powerups) gez
      for (const po of s.powerups) {
        const dx = po.pos.x - bot.pos.x;
        const dy = po.pos.y - bot.pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Can düşükken şifa parşömenini 2 kat daha cazip hale getir (mesafe ağırlığını düşür)
        const weight = (bot.hp < 75 && po.kind === "healing") ? 0.5 : 1.0;
        if (dist * weight < closestDist) {
          closestDist = dist * weight;
          bestX = po.pos.x;
          bestY = po.pos.y;
        }
      }
      
      // Eğer en yakın öge koordinatı bulunduysa hedefi güncelle
      if (bestX !== -1) {
        targetX = bestX;
        targetY = bestY;
      }
    }
    
    // Bot ile hedeflenen nokta arasındaki mesafeler
    const dx = targetX - bot.pos.x;
    const dy = targetY - bot.pos.y;
    const directDist = Math.sqrt(dx * dx + dy * dy);
    
    // Menzilli silah taşıyıp taşımadığını kontrol et (Tabanca, Pompalı, Roketatar)
    const isRanged = bot.weapon.kind === "pistol" || bot.weapon.kind === "shotgun" || bot.weapon.kind === "rocket";
    let moveDir = 0; // Botun yatay hareket yönü (-1: sol, 1: sağ, 0: dur)
    
    if (!seekItem && isRanged) {
      // Menzilli silahı varken oyuncuyla savaşıyorsa ideal mesafeyi (200-380px) koru (Kiting)
      if (directDist < 170) {
        // Çok yakın! Geriye doğru kaçarak mesafeyi aç
        moveDir = dx > 0 ? -1 : 1;
      } else if (directDist > 380) {
        // Çok uzak! Ateş etmek için hedefe yaklaş
        moveDir = dx > 0 ? 1 : -1;
      } else {
        // İdeal menzilde! Durup ateş et
        moveDir = 0;
      }
    } else {
      // Yakın dövüş silahı varsa veya silah arıyorsa doğrudan hedefe doğru koş
      if (Math.abs(dx) > 15) {
        moveDir = dx > 0 ? 1 : -1;
      }
    }
    
    // Yatay hareket tuşlarını aktifleştir
    if (moveDir === -1) s.keys.add("ArrowLeft");
    else if (moveDir === 1) s.keys.add("ArrowRight");
    
    // Gelişmiş Platform Yol Bulma (Platform altında düz zıplayıp sıkışmayı önleme)
    let finalTargetX = targetX;
    if (dy < -40 && Math.abs(dx) < 250) {
      for (const pf of s.platforms) {
        // Eğer hedeflenen platform dikey olarak botun yukarısındaysa
        if (pf.y < bot.pos.y - 10 && pf.y > targetY - 20) {
          // Ve bot yatay olarak bu platformun altındaki gölgedeyse
          if (bot.pos.x > pf.x - 15 && bot.pos.x < pf.x + pf.w + 15) {
            // Platform tavanına çarpmak yerine platformun en yakın sol veya sağ kenarına koş
            const toLeft = Math.abs(bot.pos.x - pf.x);
            const toRight = Math.abs(bot.pos.x - (pf.x + pf.w));
            if (toLeft < toRight) {
              finalTargetX = pf.x - 45; // Sol köşeye yönlen
            } else {
              finalTargetX = pf.x + pf.w + 45; // Sağ köşeye yönlen
            }
            
            // Kenara koşmak için yatay hareket tuşlarını ez/güncelle
            const pathDx = finalTargetX - bot.pos.x;
            if (Math.abs(pathDx) > 15) {
              s.keys.delete("ArrowLeft");
              s.keys.delete("ArrowRight");
              if (pathDx < 0) s.keys.add("ArrowLeft");
              else s.keys.add("ArrowRight");
            }
            break;
          }
        }
      }
    }
    
    // Önündeki engelleri veya platform yüksekliklerini algıla
    const nextX = bot.pos.x + Math.sign(dx) * 35;
    let wallAhead = false;
    for (const pf of s.platforms) {
      if (nextX > pf.x && nextX < pf.x + pf.w && bot.pos.y > pf.y && bot.pos.y < pf.y + pf.h + 80) {
        wallAhead = true;
        break;
      }
    }
    
    const wantsToJumpUp = dy < -45 && Math.abs(finalTargetX - bot.pos.x) < 220;
    const tryingToMove = s.keys.has("ArrowLeft") || s.keys.has("ArrowRight");
    // Sıkışma Kontrolü: Bot hareket etmeye çalışıyor ama hızı sıfıra yakınsa (bir engelle takıldıysa)
    const isStuck = tryingToMove && Math.abs(bot.vel.x) < 25;
    
    // Platform tırmanma, sıkışma veya engel aşma durumunda zıpla
    if ((wallAhead || wantsToJumpUp || isStuck) && bot.onGround && Math.random() < 0.22) {
      s.keysPressed.add("ArrowUp");
      s.keys.add("ArrowUp");
    }
    
    // Çift Zıplama (Double Jump): Hedef çok yukarıdaysa havada ekstra zıpla
    if (!bot.onGround && bot.vel.y > -50 && dy < -90 && Math.random() < 0.12) {
      s.keysPressed.add("ArrowUp");
      s.keys.add("ArrowUp");
    }
    
    // Taktiksel Dash Kaçış/Saldırı Mekanizması (stamina >= 50 ise)
    if (bot.stamina >= 50 && bot.dashCd <= 0 && Math.random() < 0.04) {
      if (!seekItem && !isRanged && directDist > 140 && directDist < 260) {
        // Yakın dövüş silahı varken mesafeyi hızlı kapatıp saldırmak için ileri dash at
        s.keysPressed.add("/");
        s.keys.add("/");
      } else if (bot.hp < 40 && directDist < 120) {
        // Canı çok azsa ve rakip yakınsa hızla geriye doğru dash atarak kaç
        s.keys.delete("ArrowLeft");
        s.keys.delete("ArrowRight");
        if (dx > 0) {
          s.keys.add("ArrowLeft");
        } else {
          s.keys.add("ArrowRight");
        }
        s.keysPressed.add("/");
        s.keys.add("/");
      }
    }
    
    // Gelen Mermileri/Roketleri Algılama ve Savuşturma Sistemi
    const incomingBullet = s.bullets.find(b => 
      b.owner === 0 && 
      Math.sign(b.vel.x) === Math.sign(bot.pos.x - b.pos.x) && 
      Math.abs(b.pos.x - bot.pos.x) < 280 && 
      Math.abs(b.pos.y - bot.pos.y) < 70
    );
    
    if (incomingBullet && Math.random() < 0.70) {
      // Mermi yakındaysa mermi zamanı refleksini tetikle (Zen Focus'a basarak zamanı yavaşlat)
      s.keys.add(",");
      
      const reaction = Math.random();
      if (reaction < 0.45) {
        // Gelen atışı kalkanla engelle (Block yap)
        s.keys.add("ArrowDown");
      } else if (reaction < 0.85 && bot.onGround) {
        // Merminin üzerinden zıpla
        s.keysPressed.add("ArrowUp");
        s.keys.add("ArrowUp");
      } else if (bot.stamina >= 30) {
        // Hızlıca dash atarak mermiden sıyrıl
        s.keysPressed.add("/");
        s.keys.add("/");
      }
    }
    
    // Silah tipine göre saldırı menzili belirleme
    let attackRange = 55;
    if (bot.weapon.kind === "katana") attackRange = 85;
    else if (bot.weapon.kind === "spear") attackRange = 120;
    else if (bot.weapon.kind === "mace") attackRange = 90;
    else if (isRanged) attackRange = 450;
    
    const facingTarget = Math.sign(dx) === bot.facing;
    const closeEnough = Math.abs(dx) < attackRange && Math.abs(dy) < 80;
    
    // Menzil uygunsa saldırı tuşunu tetikle
    if (closeEnough && facingTarget) {
      // Katana taşırken seri kombinasyon yapması için saldırı hızını artır
      const rate = bot.weapon.kind === "katana" ? 0.35 : (isRanged ? 0.08 : 0.20);
      if (Math.random() < rate) {
        s.keysPressed.add(".");
        s.keys.add(".");
      }
    }
    
    // Rakip yakın menzilde vururken siper al (Reaktif Blok yap)
    const targetAttacking = target.attackTimer > 0 && Math.abs(dx) < 120 && Math.abs(dy) < 80;
    if (targetAttacking && Math.random() < 0.85) {
      s.keys.add("ArrowDown");
    }
  }

  // To support state variables dynamically
  let powerupSpawnTimer = 0;

  function step(dtReal: number) {
    const s = stateRef.current;
    
    // Environmental wind/weather particles (leaf drifts from top-right to bottom-left)
    if (Math.random() < 0.15) {
      s.particles.push({
        pos: { x: rand(0, W + 150), y: -20 },
        vel: { x: rand(-120, -40), y: rand(50, 110) },
        life: rand(7.0, 11.0),
        maxLife: 11.0,
        color: Math.random() < 0.5 ? "#2e7d32" : "#ff9800", // green or orange
        size: rand(2.2, 4.5),
        gravity: false,
        type: "leaf",
        rotSpeed: rand(-0.25, 0.25)
      });
    }
    
    // AI update if VS Bot mode
    if (s.gameMode === "vs_ai" && s.players[1]) {
      updateAI(s.players[1], dtReal);
    }

    const explodeRocket = (bx: number, by: number, ownerId: number) => {
      s.shake = Math.max(s.shake, 24);
      spawnParticles(bx, by, 25, "#ff5722", 450, { type: "leaf" });
      spawnParticles(bx, by, 20, "#ff9800", 350, { type: "dust" });
      spawnParticles(bx, by, 15, "#8d6e63", 300, { type: "splinter" });
      for (const p of s.players) {
        if (s.roundOver && p.hp <= 0) continue;
        const dx = p.pos.x - bx;
        const dy = (p.pos.y - p.h / 2) - by;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 130) {
          const force = (130 - dist) / 130;
          const dmg = Math.round(55 * force);
          const kx = Math.sign(dx) * 750 * force;
          const ky = -450 * force;
          damage(p, dmg, kx, ky, s.players[ownerId]);
        }
      }
    };
    // bullet time targetTimeScale
    const anySlow = s.bulletTimeActive.some(x => x);
    if (!s.roundOver) {
      s.targetTimeScale = anySlow ? 0.2 : 1.0;
    }

    // smooth time scale
    s.timeScale += (s.targetTimeScale - s.timeScale) * Math.min(1, dtReal * 8);
    const dt = dtReal * s.timeScale;

    // shake decay
    s.shake *= Math.pow(0.001, dtReal);

    // round restart
    if (s.roundOver) {
      s.roundOverTimer -= dtReal;
      if (s.roundOverTimer <= 0) {
        s.targetTimeScale = 1;
        initRound();
      }
    }

    // Spawn falling powerups every 15 seconds (only when round is active)
    if (!s.roundOver) {
      powerupSpawnTimer += dtReal;
      if (powerupSpawnTimer >= 15) {
        powerupSpawnTimer = 0;
        const kinds: Array<"healing" | "rage" | "shield"> = ["healing", "rage", "shield"];
        const randKind = kinds[Math.floor(Math.random() * kinds.length)];
        s.powerups.push({
          pos: { x: rand(150, W - 150), y: -20 },
          vel: { x: rand(-40, 40), y: 150 },
          kind: randKind,
          bob: 0
        });
      }
    }

    // Update powerups
    for (let i = s.powerups.length - 1; i >= 0; i--) {
      const po = s.powerups[i];
      po.pos.x += po.vel.x * dt;
      po.pos.y += po.vel.y * dt;
      po.vel.y += 400 * dt; // gravity
      po.bob += dtReal * 3;
      
      // platform landing
      let onPlat = false;
      for (const pf of s.platforms) {
        if (po.pos.x > pf.x && po.pos.x < pf.x + pf.w && po.pos.y > pf.y - 4 && po.pos.y < pf.y + pf.h) {
          po.pos.y = pf.y;
          po.vel.y = 0;
          po.vel.x = 0;
          onPlat = true;
          break;
        }
      }
      if (!onPlat && po.pos.y > H - 60) {
        po.pos.y = H - 60;
        po.vel.y = 0;
        po.vel.x = 0;
      }
      
      // player pickup check
      for (const p of s.players) {
        if (p.hp <= 0) continue;
        const dx = po.pos.x - p.pos.x;
        const dy = po.pos.y - (p.pos.y - 30);
        if (dx * dx + dy * dy < 38 * 38) {
          if (po.kind === "healing") {
            p.hp = Math.min(p.maxHp, p.hp + 35);
            spawnParticles(po.pos.x, po.pos.y, 12, "#4caf50", 250, { type: "leaf" });
          } else if (po.kind === "rage") {
            p.powerupType = "rage";
            p.powerupTimer = 6.0;
            spawnParticles(po.pos.x, po.pos.y, 15, "#d84315", 300, { type: "leaf" });
          } else if (po.kind === "shield") {
            p.powerupType = "shield";
            p.powerupTimer = 999;
            spawnParticles(po.pos.x, po.pos.y, 12, "#00acc1", 250, { type: "spark" });
          }
          s.powerups.splice(i, 1);
          break;
        }
      }
    }

    // moving platforms
    for (const pf of s.platforms) {
      if (pf.moving) {
        pf.moving.t += dtReal * pf.moving.speed;
        const offset = Math.sin(pf.moving.t) * pf.moving.range;
        if (pf.moving.axis === "y") pf.y = pf.moving.origin + offset;
        else pf.x = pf.moving.origin + offset;
      }
    }

    // players
    for (const p of s.players) {
      if (s.roundOver && p.hp <= 0) continue;
      const c = controls(p);
      
      // decrement stun & powerup timers
      p.stunTimer = Math.max(0, p.stunTimer - dtReal);
      if (p.powerupType && p.powerupType !== "shield") {
        p.powerupTimer -= dtReal;
        if (p.powerupTimer <= 0) p.powerupType = null;
      }

      // bullet time toggle (hold)
      const isStunned = p.stunTimer > 0;
      const wantSlow = !isStunned && c.slowmoHeld && p.energy > 5;
      s.bulletTimeActive[p.id] = wantSlow;
      if (wantSlow) p.energy = Math.max(0, p.energy - 40 * dtReal);
      else p.energy = Math.min(100, p.energy + 12 * dtReal);      // horizontal input
      const speedBoost = s.timeScale < 0.9 ? (1 / s.timeScale) * 0.8 : 1;
      const ax = (c.left ? -1 : 0) + (c.right ? 1 : 0);
      if (ax !== 0 && !isStunned && !p.blocking) { p.facing = ax > 0 ? 1 : -1; }
      
      let targetVx = ax * MOVE_SPEED * p.speedMultiplier * speedBoost;
      if (p.blocking || isStunned) targetVx = 0;
      
      const accel = p.onGround ? 18 : 8;
      p.vel.x += (targetVx - p.vel.x) * Math.min(1, dt * accel);

      // crouch block & stamina regenerator
      p.blocking = false;
      if (!isStunned) {
        const wantBlock = c.down && p.onGround && p.attackTimer === 0 && p.stamina > 0 && Math.abs(p.vel.x) < 50;
        if (wantBlock) {
          p.blocking = true;
          p.stamina = Math.max(0, p.stamina - 45 * dtReal);
          if (p.stamina <= 0) {
            p.blocking = false;
            p.stunTimer = 0.8;
            spawnParticles(p.pos.x, p.pos.y - p.h - 5, 8, "#ffeb3b", 100, { type: "star", gravity: false });
          }
        } else {
          p.stamina = Math.min(100, p.stamina + (p.class === "samurai" ? 38.5 : 35) * dtReal);
        }
      }

      // jump
      const jumpV = p.class === "ninja" ? JUMP_V * 1.05 : JUMP_V;
      if (c.jumpPressed && p.jumps > 0 && !isStunned && !p.blocking) {
        p.vel.y = -jumpV;
        p.jumps--;
        spawnParticles(p.pos.x, p.pos.y, 8, "#a1887f", 200, { type: "dust" });
      }
      
      // dash
      if (c.dashPressed && p.dashCd <= 0 && p.stamina >= 30 && !isStunned && !p.blocking) {
        p.vel.x = p.facing * DASH_V;
        p.vel.y = Math.min(p.vel.y, -100);
        p.dashCd = p.class === "ninja" ? 0.51 : 0.6;
        p.stamina = Math.max(0, p.stamina - 30);
        p.invuln = Math.max(p.invuln, 0.15);
        spawnParticles(p.pos.x, p.pos.y - 20, 14, p.id === 0 ? "#4caf50" : "#ff9800", 350, { type: "leaf" });
      }
      
      // slide
      if (c.down && p.onGround && Math.abs(p.vel.x) > 200 && !isStunned && !p.blocking) {
        p.slideTimer = 0.4;
      }
      p.slideTimer = Math.max(0, p.slideTimer - dtReal);

      // gravity
      p.vel.y += GRAVITY * dt;

      // attack
      if (c.attackPressed && !isStunned && !p.blocking) fire(p);
      p.weapon.cooldown = Math.max(0, p.weapon.cooldown - dtReal);
      p.attackTimer = Math.max(0, p.attackTimer - dtReal);
      p.dashCd = Math.max(0, p.dashCd - dtReal);
      p.hitFlash = Math.max(0, p.hitFlash - dtReal);
      p.invuln = Math.max(0, p.invuln - dtReal);
      p.comboTimer = Math.max(0, p.comboTimer - dtReal);

      // integrate
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;

      // platform collision (AABB vs player feet)
      p.onGround = false;
      for (const pf of s.platforms) {
        const px = p.pos.x, py = p.pos.y;
        const halfW = p.w / 2;
        if (px + halfW > pf.x && px - halfW < pf.x + pf.w) {
          // landing from above
          if (py > pf.y && py - p.vel.y * dt <= pf.y + 1 && p.vel.y >= 0) {
            p.pos.y = pf.y;
            p.vel.y = 0;
            p.onGround = true;
            p.jumps = 2;
          }
        }
      }
      // world bounds
      if (p.pos.x < 20) { p.pos.x = 20; p.vel.x = Math.max(0, p.vel.x); }
      if (p.pos.x > W - 20) { p.pos.x = W - 20; p.vel.x = Math.min(0, p.vel.x); }
      if (p.pos.y > H + 100) damage(p, 999, 0, 0);

      // pickup
      for (let i = s.pickups.length - 1; i >= 0; i--) {
        const pk = s.pickups[i];
        const dx = pk.pos.x - p.pos.x;
        const dy = (pk.pos.y) - (p.pos.y - 30);
        if (dx * dx + dy * dy < 40 * 40) {
          const def = WEAPON_DEFS[pk.kind];
          p.weapon = { kind: pk.kind, ammo: def.ammo, cooldown: 0.1 };
          spawnParticles(pk.pos.x, pk.pos.y, 12, def.color, 250, { type: "leaf" });
          s.pickups.splice(i, 1);
        }
      }
    }

    // bullets
    for (let i = s.bullets.length - 1; i >= 0; i--) {
      const b = s.bullets[i];
      // bullets follow timeScale → slow during bullet time
      b.trail.push({ x: b.pos.x, y: b.pos.y });
      if (b.trail.length > 8) b.trail.shift();
      b.pos.x += b.vel.x * dt;
      b.pos.y += b.vel.y * dt;
      
      if (!b.isRocket) {
        b.vel.y += 200 * dt; // slight drop
      } else {
        if (Math.random() < 0.3) {
          spawnParticles(b.pos.x - Math.sign(b.vel.x) * 12, b.pos.y, 1, "#ff9800", 60, { type: "leaf", gravity: false });
        }
      }
      
      b.life -= dtReal;
      if (b.life <= 0 || b.pos.x < -50 || b.pos.x > W + 50 || b.pos.y > H + 50) {
        if (b.isRocket) explodeRocket(b.pos.x, b.pos.y, b.owner);
        s.bullets.splice(i, 1); continue;
      }
      // hit other player
      const target = s.players[1 - b.owner];
      if (target.hp > 0) {
        const dx = b.pos.x - target.pos.x;
        const dy = b.pos.y - (target.pos.y - target.h / 2);
        if (Math.abs(dx) < target.w / 2 + 4 && Math.abs(dy) < target.h / 2 + 4) {
          if (b.isRocket) {
            explodeRocket(b.pos.x, b.pos.y, b.owner);
          } else {
            damage(target, b.dmg, Math.sign(b.vel.x) * 250, -150);
            spawnParticles(b.pos.x, b.pos.y, 6, "#8d6e63", 300, { type: "splinter" });
            spawnParticles(b.pos.x, b.pos.y, 6, target.color, 250, { type: "leaf" });
          }
          s.bullets.splice(i, 1); continue;
        }
      }
      // hit platforms
      let hitPlatform = false;
      for (const pf of s.platforms) {
        if (b.pos.x > pf.x && b.pos.x < pf.x + pf.w && b.pos.y > pf.y && b.pos.y < pf.y + pf.h) {
          if (b.isRocket) {
            explodeRocket(b.pos.x, b.pos.y, b.owner);
          } else {
            spawnParticles(b.pos.x, b.pos.y, 8, "#bcaaa4", 200, { type: "dust" });
          }
          s.bullets.splice(i, 1);
          hitPlatform = true;
          break;
        }
      }
      if (hitPlatform) continue;
    }

    // particles
    for (let i = s.particles.length - 1; i >= 0; i--) {
      const pa = s.particles[i];
      pa.pos.x += pa.vel.x * dt;
      pa.pos.y += pa.vel.y * dt;
      if (pa.gravity) pa.vel.y += 600 * dt;
      pa.life -= dtReal;
      if (pa.life <= 0) s.particles.splice(i, 1);
    }

    // pickup bob
    for (const pk of s.pickups) pk.bob += dtReal * 3;
  }

  function drawStickman(ctx: CanvasRenderingContext2D, p: Player, time: number) {
    const x = p.pos.x;
    const y = p.pos.y;
    ctx.save();
    
    // Scale and translate centered at the stickman's feet position (e.g. Rage Mushroom effect)
    const scale = p.powerupType === "rage" ? 1.25 : 1.0;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.translate(-x, -y);

    // Glowing damage outline / active status indicator
    ctx.shadowColor = p.powerupType === "rage" ? "#ff5722" : "rgba(0, 0, 0, 0.25)";
    ctx.shadowBlur = p.powerupType === "rage" ? 14 : 6;
    ctx.shadowOffsetY = 2;
    ctx.strokeStyle = p.hitFlash > 0 ? "#fff" : p.color;
    ctx.fillStyle = p.color;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Set up poses
    const isMoving = Math.abs(p.vel.x) > 50 && p.onGround;
    const isJumping = !p.onGround;
    const isSliding = p.slideTimer > 0;
    
    // Dynamic offsets based on movement states
    let bodyTilt = 0;
    let yOffset = 0;
    
    if (isSliding) {
      bodyTilt = -0.45 * p.facing;
      yOffset = 12;
    } else if (isMoving) {
      bodyTilt = 0.18 * p.facing;
    } else if (isJumping) {
      bodyTilt = 0.06 * p.facing;
    }
    
    const headR = 10;
    const headX = x + Math.sin(bodyTilt) * 15;
    const headY = y - 48 - yOffset;
    const shoulderX = x + Math.sin(bodyTilt) * 8;
    const shoulderY = headY + headR + 4;
    const hipX = x;
    const hipY = y - 18 - yOffset;

    // Define colors based on character classes
    let armorColor = "#2e7d32"; // Ninja Green
    let trousersColor = "#1b5e20";
    let trimColor = "#3e2723";
    let skinColor = "#ffd8b3";
    
    if (p.class === "samurai") {
      armorColor = "#d84315"; // Samurai Crimson Red
      trousersColor = "#880e4f";
      trimColor = "#ffd54f"; // Gold Trim
    } else if (p.class === "warden") {
      armorColor = "#78909c"; // Warden Slate Iron
      trousersColor = "#37474f";
      trimColor = "#37474f";
    }

    // 1. Draw head details & helmet based on class
    ctx.save();
    if (p.class === "warden") {
      // Iron Crusader Helmet
      ctx.fillStyle = p.hitFlash > 0 ? "#fff" : "#90a4ae";
      ctx.beginPath();
      ctx.arc(headX, headY, headR + 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = p.hitFlash > 0 ? "#fff" : "#455a64";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Eye grill slots
      ctx.fillStyle = "#212121";
      ctx.fillRect(headX + (p.facing === 1 ? -2 : -8), headY - 3, 10, 2.5);

      // Gold crest plume
      ctx.fillStyle = "#ffd54f";
      ctx.beginPath();
      ctx.moveTo(headX - 1.5, headY - headR);
      ctx.lineTo(headX - p.facing * 8, headY - headR - 10);
      ctx.lineTo(headX + 1.5, headY - headR);
      ctx.closePath();
      ctx.fill();
    } else if (p.class === "samurai") {
      // Samurai Kabuto Helmet
      ctx.fillStyle = p.hitFlash > 0 ? "#fff" : "#37474f";
      ctx.beginPath();
      ctx.arc(headX, headY, headR + 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = p.hitFlash > 0 ? "#fff" : "#212121";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Golden V-horns crest
      ctx.fillStyle = "#ffd54f";
      ctx.beginPath();
      ctx.moveTo(headX, headY - 7);
      ctx.lineTo(headX + p.facing * 7, headY - 14);
      ctx.lineTo(headX + p.facing * 2, headY - 7);
      ctx.closePath();
      ctx.fill();

      // Black hair queue behind
      ctx.strokeStyle = "#212121";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(headX - p.facing * 6, headY + 4);
      ctx.quadraticCurveTo(headX - p.facing * 12, headY + 11, headX - p.facing * 8, headY + 18);
      ctx.stroke();
    } else {
      // Ninja Skin Tone Base
      ctx.fillStyle = p.hitFlash > 0 ? "#fff" : skinColor;
      ctx.beginPath();
      ctx.arc(headX, headY, headR - 1, 0, Math.PI * 2);
      ctx.fill();

      // Ninja Mask cover (Lower half face)
      ctx.fillStyle = p.hitFlash > 0 ? "#fff" : "#2e7d32";
      ctx.beginPath();
      ctx.arc(headX, headY + 1, headR - 1, 0, Math.PI, false);
      ctx.fill();

      // Spiky ninja black hair
      ctx.fillStyle = "#212121";
      ctx.beginPath();
      ctx.moveTo(headX - 8, headY - 4);
      ctx.lineTo(headX - 11, headY - 11);
      ctx.lineTo(headX - 3, headY - 8);
      ctx.lineTo(headX, headY - 14);
      ctx.lineTo(headX + 4, headY - 8);
      ctx.lineTo(headX + 11, headY - 11);
      ctx.lineTo(headX + 8, headY - 4);
      ctx.closePath();
      ctx.fill();

      // Flowing green headband tie behind
      ctx.strokeStyle = p.hitFlash > 0 ? "#fff" : "#2e7d32";
      ctx.lineWidth = 2.2;
      const bandX = headX - p.facing * 8;
      const bandY = headY + 2;
      const wave1 = Math.sin(time * 16) * 4;
      const wave2 = Math.cos(time * 12) * 3;
      ctx.beginPath();
      ctx.moveTo(bandX, bandY);
      ctx.quadraticCurveTo(bandX - p.facing * 10 - p.vel.x * 0.02, bandY + wave1, bandX - p.facing * 18 - p.vel.x * 0.03, bandY + 4 + wave2);
      ctx.stroke();
    }
    ctx.restore();

    // 2. Draw torso breastplate/clothing
    ctx.save();
    ctx.fillStyle = p.hitFlash > 0 ? "#fff" : armorColor;
    ctx.beginPath();
    ctx.moveTo(shoulderX - 7 * p.facing, shoulderY);
    ctx.lineTo(shoulderX + 7 * p.facing, shoulderY);
    ctx.lineTo(hipX + 5 * p.facing, hipY);
    ctx.lineTo(hipX - 5 * p.facing, hipY);
    ctx.closePath();
    ctx.fill();

    // Armor trims/outlines
    ctx.strokeStyle = p.hitFlash > 0 ? "#fff" : trimColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(shoulderX - 7 * p.facing, shoulderY);
    ctx.lineTo(shoulderX + 7 * p.facing, shoulderY);
    ctx.lineTo(hipX + 5 * p.facing, hipY);
    ctx.lineTo(hipX - 5 * p.facing, hipY);
    ctx.closePath();
    ctx.stroke();

    // Belt Sash
    ctx.strokeStyle = p.hitFlash > 0 ? "#fff" : (p.class === "samurai" ? "#ffd54f" : "#3e2723");
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(hipX - 6, hipY);
    ctx.lineTo(hipX + 6, hipY);
    ctx.stroke();
    ctx.restore();

    // 3. Draw Legs with clothed thickness and boots
    const t = time * 12;
    let foot1X = x, foot1Y = y;
    let foot2X = x, foot2Y = y;
    
    if (isSliding) {
      foot1X = x + p.facing * 32;
      foot1Y = y;
      foot2X = x - p.facing * 12;
      foot2Y = y - 4;
    } else if (isJumping) {
      const jumpProgress = Math.min(1, Math.max(-1, p.vel.y / JUMP_V));
      foot1X = x - p.facing * 12 + p.vel.x * 0.05;
      foot1Y = y - 4 + jumpProgress * 6;
      foot2X = x + p.facing * 6 + p.vel.x * 0.03;
      foot2Y = y - 12 - jumpProgress * 4;
    } else if (isMoving) {
      const cycle = Math.sin(t);
      foot1X = x + cycle * 18;
      foot1Y = y - Math.max(0, -cycle * 6);
      foot2X = x - cycle * 18;
      foot2Y = y - Math.max(0, cycle * 6);
    } else {
      foot1X = x - 6;
      foot1Y = y;
      foot2X = x + 6;
      foot2Y = y;
    }

    // Draw Leg 1 (Hip -> Knee -> Foot)
    const mid1X = (hipX + foot1X) / 2;
    const mid1Y = (hipY + foot1Y) / 2;
    const knee1X = mid1X + (isMoving || isJumping ? p.facing * 5 : 2);
    const knee1Y = mid1Y - 2;
    
    ctx.save();
    ctx.strokeStyle = p.hitFlash > 0 ? "#fff" : trousersColor;
    ctx.lineCap = "round";
    // Thigh
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(hipX - 2 * p.facing, hipY);
    ctx.lineTo(knee1X, knee1Y);
    ctx.stroke();
    // Shin
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(knee1X, knee1Y);
    ctx.lineTo(foot1X, foot1Y - 2);
    ctx.stroke();
    
    // Draw Boot 1
    ctx.fillStyle = p.hitFlash > 0 ? "#fff" : "#3e2723";
    ctx.beginPath();
    ctx.arc(foot1X, foot1Y - 1, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Draw Leg 2 (Hip -> Knee -> Foot)
    const mid2X = (hipX + foot2X) / 2;
    const mid2Y = (hipY + foot2Y) / 2;
    const knee2X = mid2X + (isMoving ? -p.facing * 4 : -2);
    const knee2Y = mid2Y - 2;
    
    ctx.save();
    ctx.strokeStyle = p.hitFlash > 0 ? "#fff" : trousersColor;
    ctx.lineCap = "round";
    // Thigh
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(hipX + 2 * p.facing, hipY);
    ctx.lineTo(knee2X, knee2Y);
    ctx.stroke();
    // Shin
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(knee2X, knee2Y);
    ctx.lineTo(foot2X, foot2Y - 2);
    ctx.stroke();
    
    // Draw Boot 2
    ctx.fillStyle = p.hitFlash > 0 ? "#fff" : "#3e2723";
    ctx.beginPath();
    ctx.arc(foot2X, foot2Y - 1, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 4. Draw Arms (Sleeves & Skin)
    const armT = p.attackTimer > 0 ? (1 - p.attackTimer / 0.22) : 0;
    let armAngle = 0;
    
    if (p.attackTimer > 0) {
      if (p.weapon.kind === "katana") {
        const startVal = 0;
        let peakVal = -Math.PI * 0.9;
        let slashVal = Math.PI * 0.1;
        
        if (p.comboStep === 1) {
          peakVal = -Math.PI * 0.05;
          slashVal = -Math.PI * 0.85;
        } else if (p.comboStep === 2) {
          peakVal = -Math.PI * 0.6;
          slashVal = Math.PI * 0.45;
        }
        
        if (armT < 0.2) {
          const nt = armT / 0.2;
          armAngle = startVal + (peakVal - startVal) * nt;
        } else if (armT < 0.7) {
          const nt = (armT - 0.2) / 0.5;
          const ease = nt * nt * (3 - 2 * nt);
          armAngle = peakVal + (slashVal - peakVal) * ease;
        } else {
          const nt = (armT - 0.7) / 0.3;
          armAngle = slashVal + (startVal - slashVal) * nt;
        }
      } else if (p.weapon.kind === "fists") {
        const swing = Math.sin(armT * Math.PI) * 0.6;
        armAngle = swing * p.facing;
      } else {
        const kick = Math.sin(armT * Math.PI) * 0.4;
        armAngle = -kick * p.facing;
      }
    }
    
    let handX = x + Math.cos(armAngle) * 22 * p.facing;
    let handY = shoulderY + Math.sin(armAngle) * 22;
    
    if (p.attackTimer === 0 && p.weapon.kind === "fists") {
      handX = shoulderX + 4 * p.facing;
      handY = shoulderY + 16;
    }

    // Draw Main Arm (Shoulder -> Elbow -> Hand)
    const midArmX = (shoulderX + handX) / 2;
    const midArmY = (shoulderY + handY) / 2;
    const elbowX = midArmX - p.facing * 3;
    const elbowY = midArmY + 3;
    
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = p.hitFlash > 0 ? "#fff" : armorColor;
    // Shoulder to elbow (Sleeve)
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(elbowX, elbowY);
    ctx.stroke();
    
    // Elbow to Hand (Skin tone rolled sleeve)
    ctx.strokeStyle = p.hitFlash > 0 ? "#fff" : skinColor;
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(elbowX, elbowY);
    ctx.lineTo(handX, handY);
    ctx.stroke();

    // Hand circle
    ctx.fillStyle = p.hitFlash > 0 ? "#fff" : skinColor;
    ctx.beginPath();
    ctx.arc(handX, handY, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Draw Off Arm (Behind upper body)
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.lineCap = "round";
    let offHandX = shoulderX - 10 * p.facing;
    let offHandY = shoulderY + 14;
    
    if (p.weapon.kind !== "fists") {
      offHandX = handX - p.facing * 8;
      offHandY = handY + 2;
    }
    
    ctx.strokeStyle = p.hitFlash > 0 ? "#fff" : armorColor;
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(offHandX, offHandY);
    ctx.stroke();
    
    ctx.fillStyle = p.hitFlash > 0 ? "#fff" : skinColor;
    ctx.beginPath();
    ctx.arc(offHandX, offHandY, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Wind sweep slash trail for katana combo
    if (p.weapon.kind === "katana" && p.attackTimer > 0 && armT >= 0.2 && armT <= 0.8) {
      ctx.save();
      ctx.lineCap = "round";
      
      const shoulderX = x;
      const shoulderY = headY + headR + 6;
      const radius = 86;
      
      let a1 = -Math.PI * 0.9;
      if (p.comboStep === 1) {
        a1 = -Math.PI * 0.05;
      } else if (p.comboStep === 2) {
        a1 = -Math.PI * 0.6;
      }
      const a2 = armAngle;
      
      let outerColor = "rgba(119, 255, 255, 0.4)";
      let innerColor = "rgba(230, 240, 255, 0.7)";
      if (p.comboStep === 1) {
        outerColor = "rgba(76, 175, 80, 0.4)";
        innerColor = "rgba(230, 255, 230, 0.7)";
      } else if (p.comboStep === 2) {
        outerColor = "rgba(216, 67, 21, 0.5)";
        innerColor = "rgba(255, 230, 200, 0.8)";
      }
      
      const cc = p.comboStep === 1;
      
      ctx.strokeStyle = outerColor;
      ctx.lineWidth = 6;
      ctx.beginPath();
      if (p.facing === 1) {
        ctx.arc(shoulderX, shoulderY, radius, a1, a2, cc);
      } else {
        const mirrorA1 = Math.PI - a1;
        const mirrorA2 = Math.PI - a2;
        ctx.arc(shoulderX, shoulderY, radius, mirrorA1, mirrorA2, !cc);
      }
      ctx.stroke();
      
      ctx.strokeStyle = innerColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      if (p.facing === 1) {
        ctx.arc(shoulderX, shoulderY, radius, a1, a2, cc);
      } else {
        const mirrorA1 = Math.PI - a1;
        const mirrorA2 = Math.PI - a2;
        ctx.arc(shoulderX, shoulderY, radius, mirrorA1, mirrorA2, !cc);
      }
      ctx.stroke();
      ctx.restore();
    }

    // weapon
    drawWeapon(ctx, p, handX, handY, armAngle);

    // Blocking barrier visual effect
    if (p.blocking) {
      ctx.save();
      ctx.strokeStyle = p.color;
      ctx.fillStyle = p.color + "22";
      ctx.lineWidth = 3;
      ctx.beginPath();
      const arcCenterX = handX + p.facing * 8;
      const arcCenterY = handY;
      if (p.facing === 1) {
        ctx.arc(arcCenterX, arcCenterY, 20, -Math.PI / 2, Math.PI / 2, false);
      } else {
        ctx.arc(arcCenterX, arcCenterY, 20, -Math.PI / 2, Math.PI / 2, true);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Shield bubble powerup overlay
    if (p.powerupType === "shield") {
      ctx.save();
      ctx.strokeStyle = "rgba(0, 172, 193, 0.75)";
      ctx.fillStyle = "rgba(0, 172, 193, 0.12)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(headX - p.facing * 3, headY + 25, 34, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // Stun dizzy stars
    if (p.stunTimer > 0) {
      ctx.save();
      ctx.fillStyle = "#ffeb3b";
      const starCount = 3;
      for (let i = 0; i < starCount; i++) {
        const starAngle = time * 7 + (i * Math.PI * 2) / starCount;
        const sx = headX + Math.cos(starAngle) * 14;
        const sy = headY - 14 + Math.sin(starAngle) * 3;
        ctx.beginPath();
        ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();
  }

  function drawWeapon(ctx: CanvasRenderingContext2D, p: Player, hx: number, hy: number, angle: number) {
    const def = WEAPON_DEFS[p.weapon.kind];
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(p.facing === 1 ? angle : Math.PI - angle);
    ctx.strokeStyle = def.color;
    ctx.fillStyle = def.color;
    ctx.lineWidth = 3.5;
    switch (p.weapon.kind) {
      case "fists": break;
      case "katana":
        ctx.strokeStyle = "#b0bec5"; // Steel grey
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(70, -4); ctx.stroke();
        ctx.strokeStyle = "#8d6e63"; // Wood brown
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.stroke();
        break;
      case "pistol":
        ctx.fillStyle = "#8d6e63"; // Wooden grip
        ctx.fillRect(0, 0, 4, 10);
        ctx.fillStyle = "#b0bec5"; // Steel barrel
        ctx.fillRect(0, -4, 22, 6);
        ctx.fillStyle = "#37474f"; // Trigger guard/cylinder
        ctx.fillRect(4, 2, 4, 4);
        break;
      case "shotgun":
        ctx.fillStyle = "#5d4037"; // Wooden stock
        ctx.fillRect(-8, -2, 12, 6);
        ctx.fillRect(-12, 2, 6, 8); // Grip
        ctx.fillStyle = "#37474f"; // Steel receiver
        ctx.fillRect(4, -5, 8, 8);
        ctx.fillStyle = "#78909c"; // Double steel barrels
        ctx.fillRect(12, -5, 28, 6);
        break;
      case "rocket":
        ctx.fillStyle = "#4e342e"; // Heavy wooden barrel
        ctx.fillRect(-10, -6, 45, 12);
        ctx.fillStyle = "#8d6e63"; // Wood bands
        ctx.fillRect(-6, 6, 6, 12);
        ctx.fillRect(15, 6, 5, 8);
        ctx.fillStyle = "#37474f"; // Iron ring muzzle
        ctx.fillRect(35, -8, 4, 16);
        break;
      case "spear":
        ctx.strokeStyle = "#8d6e63"; // wooden shaft
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(-20, 0);
        ctx.lineTo(60, 0);
        ctx.stroke();
        
        ctx.fillStyle = "#b0bec5"; // steel head
        ctx.beginPath();
        ctx.moveTo(60, -5);
        ctx.lineTo(76, 0);
        ctx.lineTo(60, 5);
        ctx.closePath();
        ctx.fill();
        break;
      case "mace":
        ctx.strokeStyle = "#8d6e63"; // handle
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(40, 0);
        ctx.stroke();
        
        ctx.fillStyle = "#455a64"; // heavy stone block
        ctx.fillRect(25, -12, 24, 24);
        ctx.fillStyle = "#37474f";
        ctx.fillRect(31, -8, 4, 16);
        ctx.fillRect(41, -8, 4, 16);
        break;
    }
    ctx.restore();
  }

  function render(ctx: CanvasRenderingContext2D) {
    const s = stateRef.current;
    const time = performance.now() / 1000;
    // shake
    const sx = (Math.random() - 0.5) * s.shake;
    const sy = (Math.random() - 0.5) * s.shake;
    ctx.save();
    ctx.translate(sx, sy);

    // background — forest clearing at sunset
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, "#1a237e"); // Deep dusk indigo
    bgGrad.addColorStop(0.6, "#880e4f"); // Dark purple
    bgGrad.addColorStop(1, "#ff5722"); // Sunset orange
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Warm Sun
    ctx.save();
    ctx.fillStyle = "#ffcc80";
    ctx.shadowColor = "#ffab40";
    ctx.shadowBlur = 40;
    ctx.beginPath();
    ctx.arc(W - 220, 160, 55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Distant Mountains/Hills (Layer 1)
    ctx.fillStyle = "#2d1a3c";
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, H - 180);
    ctx.quadraticCurveTo(W * 0.25, H - 240, W * 0.5, H - 160);
    ctx.quadraticCurveTo(W * 0.75, H - 100, W, H - 200);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();

    // Pine Trees on Distant Hills
    ctx.fillStyle = "#1e112a";
    const treePositions = [80, 180, 260, 420, 520, 710, 840, 960, 1120, 1200];
    for (const tx of treePositions) {
      const ty = H - 170 + Math.sin(tx) * 30;
      ctx.beginPath();
      ctx.moveTo(tx, ty - 60);
      ctx.lineTo(tx - 20, ty);
      ctx.lineTo(tx + 20, ty);
      ctx.closePath();
      ctx.fill();
      
      ctx.beginPath();
      ctx.moveTo(tx, ty - 85);
      ctx.lineTo(tx - 15, ty - 35);
      ctx.lineTo(tx + 15, ty - 35);
      ctx.closePath();
      ctx.fill();
    }

    // Closer Forest Hills (Layer 2)
    ctx.fillStyle = "#1b3022"; // Dark forest green
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, H - 100);
    ctx.quadraticCurveTo(W * 0.3, H - 140, W * 0.6, H - 90);
    ctx.quadraticCurveTo(W * 0.8, H - 60, W, H - 120);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();

    // Pine Trees on closer hills
    ctx.fillStyle = "#0b1d12";
    const closeTrees = [40, 120, 310, 480, 620, 780, 920, 1050, 1160, 1240];
    for (const tx of closeTrees) {
      const ty = H - 100 + Math.sin(tx) * 20;
      ctx.beginPath();
      ctx.moveTo(tx, ty - 70);
      ctx.lineTo(tx - 22, ty);
      ctx.lineTo(tx + 22, ty);
      ctx.closePath();
      ctx.fill();
      
      ctx.beginPath();
      ctx.moveTo(tx, ty - 100);
      ctx.lineTo(tx - 16, ty - 40);
      ctx.lineTo(tx + 16, ty - 40);
      ctx.closePath();
      ctx.fill();
    }

    // focus-time vignette (warm natural shading)
    const slow = s.timeScale < 0.9;
    if (slow) {
      const v = ctx.createRadialGradient(W/2, H/2, 100, W/2, H/2, 700);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, `rgba(46, 125, 50, ${0.4 * (1 - s.timeScale)})`); // Leaf green glow vignette
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }

    // Beautiful foreground trees framing the screen (Left & Right) for deep forest aesthetic
    ctx.save();
    ctx.fillStyle = "#0c180e"; // Dark forest silhouette
    ctx.strokeStyle = "#08100a";
    ctx.lineWidth = 3.5;
    
    // Left tree trunk & root flare
    ctx.beginPath();
    ctx.moveTo(-20, H);
    ctx.lineTo(-20, 0);
    ctx.quadraticCurveTo(35, 120, 25, 0);
    ctx.lineTo(-20, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Left tree branches & leafy foliage
    ctx.fillStyle = "#08100a";
    ctx.beginPath();
    ctx.arc(30, 100, 45, 0, Math.PI * 2);
    ctx.arc(65, 45, 55, 0, Math.PI * 2);
    ctx.arc(100, 120, 35, 0, Math.PI * 2);
    ctx.fill();
    
    // Right tree trunk
    ctx.fillStyle = "#0c180e";
    ctx.beginPath();
    ctx.moveTo(W + 20, H);
    ctx.lineTo(W + 20, 0);
    ctx.quadraticCurveTo(W - 35, 120, W - 25, 0);
    ctx.lineTo(W + 20, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Right tree foliage
    ctx.fillStyle = "#08100a";
    ctx.beginPath();
    ctx.arc(W - 30, 90, 50, 0, Math.PI * 2);
    ctx.arc(W - 70, 40, 48, 0, Math.PI * 2);
    ctx.arc(W - 105, 110, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // platforms (mossy rock blocks)
    for (const pf of s.platforms) {
      ctx.save();
      // Stone base
      ctx.fillStyle = "#4e342e";
      ctx.fillRect(pf.x, pf.y, pf.w, pf.h);
      
      // Stone bricks texture lines
      ctx.strokeStyle = "#3e2723";
      ctx.lineWidth = 2;
      ctx.strokeRect(pf.x + 0.5, pf.y + 0.5, pf.w - 1, pf.h - 1);
      
      for (let sx = pf.x + 60; sx < pf.x + pf.w; sx += 60) {
        ctx.beginPath();
        ctx.moveTo(sx, pf.y);
        ctx.lineTo(sx, pf.y + pf.h);
        ctx.stroke();
      }

      // Moss cover
      ctx.fillStyle = "#2e7d32";
      ctx.fillRect(pf.x, pf.y, pf.w, Math.min(pf.h, 6));
      
      // Moss details
      ctx.fillStyle = "#1b5e20";
      for (let gx = pf.x + 4; gx < pf.x + pf.w - 4; gx += 8) {
        ctx.beginPath();
        ctx.moveTo(gx, pf.y + 6);
        ctx.lineTo(gx - 2, pf.y + 10);
        ctx.lineTo(gx + 2, pf.y + 10);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // pickups (wood scrolls/tokens)
    for (const pk of s.pickups) {
      const def = WEAPON_DEFS[pk.kind];
      const yBob = Math.sin(pk.bob) * 6;
      ctx.save();
      ctx.translate(pk.pos.x, pk.pos.y + yBob);
      
      // Shadow
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.beginPath();
      ctx.arc(0, 8, 16, 0, Math.PI * 2);
      ctx.fill();

      // Wooden token
      ctx.fillStyle = "#d7ccc8";
      ctx.strokeStyle = "#5d4037";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      
      ctx.strokeStyle = "#8d6e63";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.stroke();

      // Draw miniature weapon drawings inside the token
      ctx.strokeStyle = "#5d4037";
      ctx.fillStyle = "#5d4037";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      
      if (pk.kind === "katana") {
        ctx.beginPath();
        ctx.moveTo(-10, 6);
        ctx.lineTo(10, -10); // Blade
        ctx.stroke();
        // Guard
        ctx.beginPath();
        ctx.moveTo(-6, -1);
        ctx.lineTo(-2, 3);
        ctx.stroke();
      } else if (pk.kind === "pistol") {
        ctx.fillRect(-6, -3, 12, 4); // Barrel
        ctx.fillRect(-4, 1, 3, 5);   // Grip
        ctx.fillRect(0, 1, 2, 2);   // Trigger guard
      } else if (pk.kind === "shotgun") {
        ctx.fillRect(-9, -3, 18, 3.5); // Barrels
        ctx.fillRect(-10, -1, 5, 3.5); // Stock
        ctx.fillRect(-5, 0.5, 3.5, 3.5); // Grip
      } else if (pk.kind === "rocket") {
        ctx.fillRect(-9, -4.5, 18, 7.5); // Launcher tube
        ctx.fillRect(-4, 3, 2, 3); // Grip
        ctx.fillRect(3, 3, 2, 2.5); // Second handle
      } else if (pk.kind === "spear") {
        ctx.beginPath();
        ctx.moveTo(-10, 8);
        ctx.lineTo(8, -8); // shaft
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(6, -6);
        ctx.lineTo(11, -11);
        ctx.lineTo(9, -4);
        ctx.closePath();
        ctx.fill();
      } else if (pk.kind === "mace") {
        ctx.beginPath();
        ctx.moveTo(-7, 7);
        ctx.lineTo(3, -3); // shaft
        ctx.stroke();
        ctx.fillRect(2, -8, 8, 8); // head
      }
      ctx.restore();
    }

    // powerups (falling/floating scrolls)
    for (const po of s.powerups) {
      const yBob = Math.sin(po.bob) * 4;
      ctx.save();
      ctx.translate(po.pos.x, po.pos.y + yBob);
      
      // glowing aura
      const auraColor = po.kind === "healing" ? "rgba(76, 175, 80, 0.3)" : (po.kind === "rage" ? "rgba(216, 67, 21, 0.3)" : "rgba(0, 172, 193, 0.3)");
      ctx.fillStyle = auraColor;
      ctx.shadowColor = po.kind === "healing" ? "#4caf50" : (po.kind === "rage" ? "#d84315" : "#00acc1");
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0; // reset
      
      // parchment scroll body
      ctx.fillStyle = "#fcfaf2";
      ctx.strokeStyle = "#5d4037";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(-12, -6, 24, 12, 4);
      ctx.fill(); ctx.stroke();
      
      // ribbon tie
      ctx.fillStyle = po.kind === "healing" ? "#4caf50" : (po.kind === "rage" ? "#d84315" : "#00acc1");
      ctx.fillRect(-3, -7, 6, 14);
      ctx.restore();
    }

    // bullets with trails (wind trails)
    for (const b of s.bullets) {
      ctx.save();
      ctx.strokeStyle = "rgba(120, 120, 120, 0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < b.trail.length; i++) {
        const pt = b.trail[i];
        if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
      }
      ctx.lineTo(b.pos.x, b.pos.y);
      ctx.stroke();
      
      if (b.isRocket) {
        ctx.save();
        ctx.translate(b.pos.x, b.pos.y);
        ctx.rotate(Math.atan2(b.vel.y, b.vel.x));
        ctx.fillStyle = "#37474f"; // metal rocket body
        ctx.fillRect(-12, -4, 18, 8);
        ctx.fillStyle = "#ff5722"; // nose cone
        ctx.beginPath();
        ctx.moveTo(6, -4); ctx.lineTo(14, 0); ctx.lineTo(6, 4);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = "#455a64"; // Slate stone bullet
        ctx.beginPath();
        ctx.arc(b.pos.x, b.pos.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // particles (leaves, splinters, dust)
    for (const pa of s.particles) {
      const a = Math.max(0, pa.life / pa.maxLife);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = pa.color;
      
      const type = pa.type || "dust";
      const size = pa.size;
      
      if (type === "leaf") {
        const rot = (pa.rotSpeed || 0) * (pa.maxLife - pa.life) * 10;
        ctx.translate(pa.pos.x, pa.pos.y);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 2, size, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (type === "splinter") {
        const rot = Math.atan2(pa.vel.y, pa.vel.x);
        ctx.translate(pa.pos.x, pa.pos.y);
        ctx.rotate(rot);
        ctx.strokeStyle = pa.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-size * 2, 0);
        ctx.lineTo(size * 2, 0);
        ctx.stroke();
      } else if (type === "spark") {
        const rot = Math.atan2(pa.vel.y, pa.vel.x);
        ctx.translate(pa.pos.x, pa.pos.y);
        ctx.rotate(rot);
        ctx.strokeStyle = pa.color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-size, 0);
        ctx.lineTo(size, 0);
        ctx.stroke();
      } else if (type === "star") {
        ctx.translate(pa.pos.x, pa.pos.y);
        ctx.rotate((pa.rotSpeed || 0) * (pa.maxLife - pa.life) * 8);
        ctx.fillStyle = "#ffeb3b";
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          ctx.lineTo(Math.cos((18 + i * 72) * Math.PI / 180) * size, -Math.sin((18 + i * 72) * Math.PI / 180) * size);
          ctx.lineTo(Math.cos((54 + i * 72) * Math.PI / 180) * (size / 2), -Math.sin((54 + i * 72) * Math.PI / 180) * (size / 2));
        }
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(pa.pos.x, pa.pos.y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // players
    for (const p of s.players) {
      drawStickman(ctx, p, time);
    }

    ctx.restore();

    // HUD
    drawHUD(ctx);

    // round over banner
    if (s.roundOver) {
      ctx.save();
      ctx.fillStyle = "rgba(62, 39, 35, 0.85)"; // Deep wood brown board
      ctx.fillRect(0, H / 2 - 60, W, 120);
      ctx.strokeStyle = "#8d6e63";
      ctx.lineWidth = 4;
      ctx.strokeRect(-10, H / 2 - 60, W + 20, 120);

      ctx.fillStyle = "#fcfaf2"; // Parchment text
      ctx.font = "bold 52px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(s.winnerText, W / 2, H / 2);
      ctx.restore();
    }
  }

  function drawHUD(ctx: CanvasRenderingContext2D) {
    const s = stateRef.current;
    for (const p of s.players) {
      const isP1 = p.id === 0;
      const x = isP1 ? 20 : W - 280;
      const y = 20;
      ctx.save();
      // panel (parchment card style, taller to fit stamina)
      ctx.fillStyle = "rgba(252, 250, 242, 0.9)";
      ctx.strokeStyle = "#5d4037"; // dark wood
      ctx.lineWidth = 3;
      ctx.fillRect(x, y, 260, 94);
      ctx.strokeRect(x + 0.5, y + 0.5, 259, 93);
      
      // label
      ctx.fillStyle = p.color;
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`PLAYER ${p.id + 1}`, x + 12, y + 20);
      
      // class text
      ctx.fillStyle = "#8d6e63";
      ctx.font = "italic bold 9px sans-serif";
      ctx.fillText(p.class.toUpperCase(), x + 198, y + 11);

      // Round Wins (small leaves next to name)
      ctx.fillStyle = "#81c784";
      for (let r = 0; r < p.wins; r++) {
        ctx.beginPath();
        ctx.arc(x + 95 + r * 14, y + 16, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.fillStyle = "#5d4037";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(`WINS ${p.wins}`, x + 198, y + 22);
      
      // HP bar (scaled dynamically by maxHp)
      ctx.fillStyle = "#d7ccc8";
      ctx.fillRect(x + 12, y + 28, 236, 12);
      ctx.fillStyle = p.hp > 30 ? "#558b2f" : "#c62828"; // Moss green / rust red
      ctx.fillRect(x + 12, y + 28, 236 * Math.max(0, p.hp) / p.maxHp, 12);
      ctx.strokeStyle = "#5d4037";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 12, y + 28, 236, 12);
      
      // focus energy
      ctx.fillStyle = "#efebe9";
      ctx.fillRect(x + 12, y + 45, 236, 7);
      ctx.fillStyle = s.bulletTimeActive[p.id] ? "#f57c00" : "#ffb300"; // focus active vs charge
      ctx.fillRect(x + 12, y + 45, 236 * p.energy / 100, 7);
      ctx.strokeStyle = "#5d4037";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 12, y + 45, 236, 7);

      // stamina bar
      ctx.fillStyle = "#efebe9";
      ctx.fillRect(x + 12, y + 56, 236, 6);
      ctx.fillStyle = p.stunTimer > 0 ? "#b0bec5" : "#ffd54f"; // stun grey vs gold stamina
      ctx.fillRect(x + 12, y + 56, 236 * p.stamina / 100, 6);
      ctx.strokeStyle = "#5d4037";
      ctx.strokeRect(x + 12, y + 56, 236, 6);
      
      // weapon
      const def = WEAPON_DEFS[p.weapon.kind];
      ctx.fillStyle = "#5d4037";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(def.name, x + 12, y + 80);
      if (p.weapon.ammo >= 0) {
        ctx.fillStyle = "#8d6e63";
        ctx.font = "900 10px sans-serif";
        ctx.fillText(`AMMO ${p.weapon.ammo}`, x + 180, y + 80);
      }

      // Active power-up indicator
      let powerupText = "";
      if (p.powerupType === "rage") powerupText = `RAGE ${p.powerupTimer.toFixed(1)}s`;
      else if (p.powerupType === "shield") powerupText = "SHIELD ACTIVE";
      
      if (powerupText) {
        ctx.fillStyle = p.powerupType === "rage" ? "#d84315" : "#0097a7";
        ctx.font = "bold 9px sans-serif";
        ctx.fillText(powerupText, x + 90, y + 80);
      }

      ctx.restore();
    }
    // time scale indicator
    if (s.timeScale < 0.9) {
      ctx.save();
      ctx.fillStyle = "#2e7d32";
      ctx.font = "bold 18px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("◆ ZEN FOCUS ◆", W / 2, 40);
      ctx.restore();
    }
  }

  // void noop to use setScoreTick triggers
  void scoreTick;

  return (
    <div className="relative w-full h-full min-h-screen bg-gradient-to-br from-[#efebe9] to-[#d7ccc8] flex flex-col items-center justify-center p-4">
      {!started ? (
        <StartScreen onSelectMode={(selectedMode) => {
          setMode(selectedMode);
          if (selectedMode === "training") {
            setP2Class("warden");
          }
          setStarted(true);
          setCharSelectActive(true);
        }} />
      ) : charSelectActive ? (
        <CharacterSelectScreen
          mode={mode}
          p1Class={p1Class}
          p2Class={p2Class}
          onSelectP1Class={setP1Class}
          onSelectP2Class={setP2Class}
          onBack={() => setStarted(false)}
          onFight={() => {
            const s = stateRef.current;
            s.gameMode = mode;
            s.p1SelectedClass = p1Class;
            s.p2SelectedClass = p2Class;
            s.characterSelectActive = false;
            s.roundWins = [0, 0];
            s.currentRound = 1;
            setCharSelectActive(false);
            initRound();
          }}
        />
      ) : (
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="border-4 border-[#5d4037] rounded-xl shadow-2xl"
            style={{
              maxWidth: "100vw",
              maxHeight: "100vh",
              boxShadow: "0 10px 40px rgba(93, 64, 55, 0.35)",
            }}
          />
          <button
            onClick={() => {
              setCharSelectActive(true);
            }}
            className="absolute top-4 right-4 px-4 py-2 text-xs font-sans font-bold uppercase tracking-wider rounded-md bg-[#fcfaf2]/90 border-2 border-[#5d4037] text-[#5d4037] hover:bg-[#efebe9] transition-colors shadow-md"
          >
            Leave Woods
          </button>
        </div>
      )}
    </div>
  );
}

function StartScreen({ onSelectMode }: { onSelectMode: (mode: "pvp" | "vs_ai" | "training") => void }) {
  return (
    <div className="flex flex-col items-center gap-6 p-8 text-center max-w-4xl bg-[#fcfaf2]/85 border-2 border-[#5d4037] rounded-2xl shadow-2xl backdrop-blur-md">
      <div>
        <h1
          className="font-sans font-black text-6xl md:text-7xl tracking-tight"
          style={{
            background: "linear-gradient(90deg, #2e7d32, #d84315)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow: "2px 2px 0px rgba(93, 64, 55, 0.15)",
          }}
        >
          WILDWOOD STRIKE
        </h1>
        <p className="mt-3 text-[#5d4037] font-semibold uppercase tracking-[0.3em] text-xs">
          Stickman Fight · Zen Focus · Local 2P & AI
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 w-full justify-center my-2">
        <button
          onClick={() => onSelectMode("pvp")}
          className="px-6 py-3 font-sans font-bold text-base uppercase tracking-wider rounded-md bg-[#2e7d32] border-b-4 border-[#1b5e20] text-white hover:scale-105 transition-transform"
          style={{ boxShadow: "0 4px 14px rgba(46, 125, 50, 0.3)" }}
        >
          Local 1v1 PVP
        </button>
        <button
          onClick={() => onSelectMode("vs_ai")}
          className="px-6 py-3 font-sans font-bold text-base uppercase tracking-wider rounded-md bg-[#d84315] border-b-4 border-[#bf360c] text-white hover:scale-105 transition-transform"
          style={{ boxShadow: "0 4px 14px rgba(216, 67, 21, 0.3)" }}
        >
          Fight Wild Bot (AI)
        </button>
        <button
          onClick={() => onSelectMode("training")}
          className="px-6 py-3 font-sans font-bold text-base uppercase tracking-wider rounded-md bg-[#78909c] border-b-4 border-[#546e7a] text-white hover:scale-105 transition-transform"
          style={{ boxShadow: "0 4px 14px rgba(120, 144, 156, 0.3)" }}
        >
          Training Range
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4 w-full">
        <ControlsCard
          color="#2e7d32"
          label="PLAYER 1 (FOREST)"
          rows={[
            ["Move / Walk", "A / D"],
            ["Jump / Double", "W"],
            ["Crouch / Block", "S (Hold on Ground)"],
            ["Dash / Evade", "Shift / Q (Uses 30 Stamina)"],
            ["Attack / Strike", "F"],
            ["Zen Focus", "E (Hold)"],
          ]}
        />
        <ControlsCard
          color="#d84315"
          label="PLAYER 2 (AUTUMN)"
          rows={[
            ["Move / Walk", "← / →"],
            ["Jump / Double", "↑"],
            ["Crouch / Block", "↓ (Hold on Ground)"],
            ["Dash / Evade", "/ (Uses 30 Stamina)"],
            ["Attack / Strike", "."],
            ["Zen Focus", ", (Hold)"],
          ]}
        />
      </div>

      <p className="text-xs text-[#8d6e63] max-w-lg mt-2">
        Collect wooden scroll packages containing items. Blocking reduces damage by 80% but drains stamina. Stun stars appear on shield break.
      </p>
    </div>
  );
}

function CharacterSelectScreen({
  mode,
  p1Class,
  p2Class,
  onSelectP1Class,
  onSelectP2Class,
  onBack,
  onFight,
}: {
  mode: "pvp" | "vs_ai" | "training";
  p1Class: PlayerClass;
  p2Class: PlayerClass;
  onSelectP1Class: (c: PlayerClass) => void;
  onSelectP2Class: (c: PlayerClass) => void;
  onBack: () => void;
  onFight: () => void;
}) {
  const renderClassBox = (pNum: number, currentClass: PlayerClass, onSelect: (c: PlayerClass) => void) => {
    const classesList: Array<{ id: PlayerClass; name: string; color: string; desc: string; stats: string[] }> = [
      {
        id: "ninja",
        name: "Leaf Ninja",
        color: "#2e7d32",
        desc: "Agile tree-runner. High speed and swift dashes.",
        stats: ["HP: 100", "Speed: 105%", "Jump Height: 105%", "Dash Cooldown: -15%"],
      },
      {
        id: "samurai",
        name: "Ember Samurai",
        color: "#d84315",
        desc: "Fiery swordmaster. Strong combos and fast stamina recovery.",
        stats: ["HP: 100", "Stamina Regen: +10%", "Katana damage: +15%", "Stance: Balanced"],
      },
      {
        id: "warden",
        name: "Stone Warden",
        color: "#78909c",
        desc: "Sturdy forest protector. Massive health and passive damage reduction.",
        stats: ["HP: 125", "Defense: +15% Damage Reduction", "Speed: 90%", "Stance: Heavy Guard"],
      },
    ];

    return (
      <div className="flex flex-col gap-4 bg-[#fcfaf2]/90 border-2 border-[#5d4037] p-5 rounded-xl shadow-md w-full max-w-sm">
        <h2 className="font-sans font-bold text-lg text-[#5d4037] border-b-2 border-[#d7ccc8] pb-1">
          PLAYER {pNum} {mode === "vs_ai" && pNum === 2 ? "(BOT)" : ""}
        </h2>
        <div className="flex flex-col gap-2">
          {classesList.map((cl) => {
            const selected = currentClass === cl.id;
            return (
              <button
                key={cl.id}
                onClick={() => onSelect(cl.id)}
                className={`p-3 rounded-lg border text-left transition-all hover:scale-[1.02] ${
                  selected ? "border-[#5d4037] bg-[#efebe9]" : "border-[#d7ccc8] bg-transparent"
                }`}
                style={{ borderLeftWidth: selected ? "6px" : "1px", borderLeftColor: cl.color }}
              >
                <div className="font-sans font-bold text-sm" style={{ color: cl.color }}>
                  {cl.name}
                </div>
                <div className="text-xs text-[#8d6e63] mt-0.5 leading-tight">{cl.desc}</div>
                {selected && (
                  <ul className="mt-2 grid grid-cols-2 gap-x-2 text-[10px] font-mono text-[#3e2723] bg-[#fcfaf2]/80 p-1.5 rounded border border-[#d7ccc8]">
                    {cl.stats.map((s, idx) => <li key={idx}>• {s}</li>)}
                  </ul>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center gap-6 p-6 text-center max-w-4xl bg-[#fcfaf2]/85 border-2 border-[#5d4037] rounded-2xl shadow-2xl backdrop-blur-md w-full">
      <div>
        <h1 className="font-sans font-black text-4xl tracking-tight text-[#5d4037]">
          SELECT CHARACTER CLASS
        </h1>
        <p className="text-[#8d6e63] uppercase tracking-[0.2em] text-[10px] mt-1">
          Choose your signature stats and archetype
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 w-full justify-center">
        {renderClassBox(1, p1Class, onSelectP1Class)}
        {mode === "training" ? (
          <div className="flex flex-col gap-4 bg-[#fcfaf2]/90 border-2 border-[#5d4037] p-5 rounded-xl shadow-md w-full max-w-sm justify-center items-center">
            <h2 className="font-sans font-bold text-lg text-[#5d4037] border-b-2 border-[#d7ccc8] pb-1 w-full text-center">
              PLAYER 2 (TARGET)
            </h2>
            <div className="py-6 text-center">
              <div className="font-sans font-bold text-lg text-[#78909c]">Stone Warden Dummy</div>
              <p className="text-xs text-[#8d6e63] max-w-xs mt-2">
                Training dummies are assigned as Stone Wardens with high HP (+25%) and passive defense to help test mace combos.
              </p>
            </div>
          </div>
        ) : (
          renderClassBox(2, p2Class, onSelectP2Class)
        )}
      </div>

      <div className="flex gap-4 mt-2">
        <button
          onClick={onBack}
          className="px-6 py-2.5 font-sans font-bold uppercase tracking-wider rounded border-2 border-[#5d4037] text-[#5d4037] hover:bg-[#efebe9] transition-colors"
        >
          Back
        </button>
        <button
          onClick={onFight}
          className="px-8 py-2.5 font-sans font-bold uppercase tracking-wider text-white rounded bg-[#2e7d32] border-b-4 border-[#1b5e20] hover:scale-105 active:scale-95 transition-transform"
          style={{ boxShadow: "0 4px 12px rgba(46, 125, 50, 0.3)" }}
        >
          Enter the forest
        </button>
      </div>
    </div>
  );
}

function ControlsCard({ color, label, rows }: { color: string; label: string; rows: [string, string][] }) {
  return (
    <div
      className="rounded-lg border-2 border-[#5d4037] bg-[#fcfaf2]/95 p-5 text-left shadow-lg backdrop-blur"
      style={{ boxShadow: `0 4px 20px rgba(93, 64, 55, 0.15)` }}
    >
      <div className="font-sans font-bold text-lg mb-3" style={{ color }}>
        {label}
      </div>
      <dl className="space-y-1.5 text-sm font-mono text-[#3e2723]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-[#efebe9] pb-1">
            <dt className="text-[#8d6e63]">{k}</dt>
            <dd className="text-[#3e2723] font-bold">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
