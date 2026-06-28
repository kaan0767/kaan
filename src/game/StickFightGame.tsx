// NEON STRIKE — a compact 2D stickman fighter
// Canvas-rendered. Local 2-player. Bullet time. Weapon pickups.
import { useEffect, useRef, useState } from "react";

type Vec = { x: number; y: number };
type WeaponKind = "fists" | "katana" | "pistol" | "shotgun";

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
}

interface Bullet {
  pos: Vec;
  vel: Vec;
  owner: 0 | 1;
  life: number;
  dmg: number;
  trail: Vec[];
  color: string;
}

interface Pickup {
  pos: Vec;
  kind: WeaponKind;
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
  type?: "leaf" | "splinter" | "dust" | "spark" | "blood";
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
  fists:   { name: "UNARMED",      ammo: -1, color: "#a1887f" },
  katana:  { name: "STEEL SWORD",  ammo: -1, color: "#b0bec5" },
  pistol:  { name: "SLINGSHOT",   ammo: 12, color: "#8d6e63" },
  shotgun: { name: "HUNTER BOW",   ammo: 6,  color: "#5d4037" },
};

function rand(a: number, b: number) { return a + Math.random() * (b - a); }

export function StickFightGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [scoreTick, setScoreTick] = useState(0);

  // Persistent game state in a ref so React doesn't re-render every frame
  const stateRef = useRef({
    players: [] as Player[],
    bullets: [] as Bullet[],
    pickups: [] as Pickup[],
    particles: [] as Particle[],
    platforms: [] as Platform[],
    keys: new Set<string>(),
    keysPressed: new Set<string>(),
    shake: 0,
    timeScale: 1,
    targetTimeScale: 1,
    bulletTimeActive: [false, false] as [boolean, boolean],
    roundOver: false,
    roundOverTimer: 0,
    winnerText: "",
  });

  // Init level
  const initRound = () => {
    const s = stateRef.current;
    s.bullets = [];
    s.particles = [];
    s.pickups = [
      { pos: { x: 250, y: 380 }, kind: "katana", bob: 0 },
      { pos: { x: 1030, y: 380 }, kind: "pistol", bob: 1 },
      { pos: { x: 640, y: 200 }, kind: "shotgun", bob: 2 },
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
      makePlayer(0, 200, H - 200, "#2e7d32", "rgba(46, 125, 50, 0.2)"),
      makePlayer(1, W - 230, H - 200, "#d84315", "rgba(216, 67, 21, 0.2)"),
    ];
    // Preserve wins
    if (stateRef.current.players.length === 2 && stateRef.current.players[0].wins != null) {
      s.players[0].wins = stateRef.current.players[0].wins;
      s.players[1].wins = stateRef.current.players[1].wins;
    }
    s.roundOver = false;
    s.roundOverTimer = 0;
    s.winnerText = "";
  };

  const makePlayer = (id: 0 | 1, x: number, y: number, color: string, glow: string): Player => ({
    id,
    pos: { x, y },
    vel: { x: 0, y: 0 },
    w: 22, h: 60,
    facing: id === 0 ? 1 : -1,
    onGround: false,
    jumps: 2,
    dashCd: 0,
    slideTimer: 0,
    hp: 100,
    energy: 100,
    weapon: { kind: "fists", ammo: -1, cooldown: 0 },
    attackTimer: 0,
    hitFlash: 0,
    color, glow,
    wins: 0,
    invuln: 0.5,
    swingDir: 1,
  });

  useEffect(() => {
    if (!started) return;
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
  }, [started]);

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
    if (p.weapon.cooldown > 0) return;
    const muzzleX = p.pos.x + p.facing * 26;
    const muzzleY = p.pos.y - p.h * 0.45;
    switch (p.weapon.kind) {
      case "fists": {
        p.weapon.cooldown = 0.35;
        p.attackTimer = 0.18;
        // melee hit
        const other = s.players[1 - p.id];
        const dx = other.pos.x - p.pos.x;
        const dy = other.pos.y - p.pos.y;
        if (Math.abs(dx) < 60 && Math.abs(dy) < 50 && Math.sign(dx) === p.facing) {
          damage(other, 8, p.facing * 350, -200);
        }
        break;
      }
      case "katana": {
        p.weapon.cooldown = 0.32;
        p.attackTimer = 0.22;
        p.swingDir = p.swingDir === 1 ? -1 : 1;
        const other = s.players[1 - p.id];
        const dx = other.pos.x - p.pos.x;
        const dy = other.pos.y - p.pos.y;
        if (Math.abs(dx) < 90 && Math.abs(dy) < 60 && Math.sign(dx) === p.facing) {
          damage(other, 28, p.facing * 500, -300);
          spawnParticles(other.pos.x, other.pos.y - 30, 10, "#90a4ae", 400, { type: "dust" });
          spawnParticles(other.pos.x, other.pos.y - 30, 10, "#8d6e63", 300, { type: "splinter" });
        }
        spawnParticles(muzzleX, muzzleY, 8, p.color, 250, { type: "leaf" });
        break;
      }
      case "pistol": {
        if (p.weapon.ammo <= 0) { p.weapon = { kind: "fists", ammo: -1, cooldown: 0.2 }; return; }
        p.weapon.cooldown = 0.22;
        p.weapon.ammo--;
        p.vel.x -= p.facing * 60; // recoil
        s.bullets.push({
          pos: { x: muzzleX, y: muzzleY },
          vel: { x: p.facing * 1400, y: rand(-20, 20) },
          owner: p.id, life: 1.2, dmg: 18, trail: [], color: "#a1887f",
        });
        s.shake = Math.max(s.shake, 4);
        spawnParticles(muzzleX, muzzleY, 4, "#8d6e63", 220, { type: "splinter", gravity: false });
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
    }
  }

  function damage(p: Player, dmg: number, kx: number, ky: number) {
    if (p.invuln > 0) return;
    p.hp -= dmg;
    p.vel.x += kx;
    p.vel.y += ky;
    p.hitFlash = 0.25;
    const s = stateRef.current;
    s.shake = Math.max(s.shake, Math.min(18, dmg * 0.6));
    spawnParticles(p.pos.x, p.pos.y - 30, Math.min(15, dmg / 2), "#8d6e63", 300, { type: "splinter" });
    spawnParticles(p.pos.x, p.pos.y - 30, Math.min(15, dmg / 2), p.color, 300, { type: "leaf" });
    if (p.hp <= 0 && !s.roundOver) {
      s.roundOver = true;
      s.roundOverTimer = 2.5;
      s.targetTimeScale = 0.15;
      const winner = s.players[1 - p.id];
      winner.wins++;
      s.winnerText = `PLAYER ${winner.id + 1} WINS`;
      setScoreTick(t => t + 1);
      // big explosion: wood splinters and leaves
      spawnParticles(p.pos.x, p.pos.y - 30, 40, "#8d6e63", 500, { type: "splinter" });
      spawnParticles(p.pos.x, p.pos.y - 30, 40, p.color, 400, { type: "leaf" });
    }
  }

  function step(dtReal: number) {
    const s = stateRef.current;
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

      // bullet time toggle (hold)
      const wantSlow = c.slowmoHeld && p.energy > 5;
      s.bulletTimeActive[p.id] = wantSlow;
      if (wantSlow) p.energy = Math.max(0, p.energy - 40 * dtReal);
      else p.energy = Math.min(100, p.energy + 12 * dtReal);

      // horizontal input — player keeps near-normal speed during slowmo
      const speedBoost = s.timeScale < 0.9 ? (1 / s.timeScale) * 0.8 : 1;
      const ax = (c.left ? -1 : 0) + (c.right ? 1 : 0);
      if (ax !== 0) { p.facing = ax > 0 ? 1 : -1; }
      const targetVx = ax * MOVE_SPEED * speedBoost;
      const accel = p.onGround ? 18 : 8;
      p.vel.x += (targetVx - p.vel.x) * Math.min(1, dt * accel);

      // jump
      if (c.jumpPressed && p.jumps > 0) {
        p.vel.y = -JUMP_V;
        p.jumps--;
        spawnParticles(p.pos.x, p.pos.y, 8, "#a1887f", 200, { type: "dust" });
      }
      // dash
      if (c.dashPressed && p.dashCd <= 0) {
        p.vel.x = p.facing * DASH_V;
        p.vel.y = Math.min(p.vel.y, -100);
        p.dashCd = 0.6;
        p.invuln = Math.max(p.invuln, 0.15);
        spawnParticles(p.pos.x, p.pos.y - 20, 14, p.id === 0 ? "#4caf50" : "#ff9800", 350, { type: "leaf" });
      }
      // slide
      if (c.down && p.onGround && Math.abs(p.vel.x) > 200) {
        p.slideTimer = 0.4;
      }
      p.slideTimer = Math.max(0, p.slideTimer - dtReal);

      // gravity
      p.vel.y += GRAVITY * dt;

      // attack
      if (c.attackPressed) fire(p);
      p.weapon.cooldown = Math.max(0, p.weapon.cooldown - dtReal);
      p.attackTimer = Math.max(0, p.attackTimer - dtReal);
      p.dashCd = Math.max(0, p.dashCd - dtReal);
      p.hitFlash = Math.max(0, p.hitFlash - dtReal);
      p.invuln = Math.max(0, p.invuln - dtReal);

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
      b.vel.y += 200 * dt; // slight drop
      b.life -= dtReal;
      if (b.life <= 0 || b.pos.x < -50 || b.pos.x > W + 50 || b.pos.y > H + 50) {
        s.bullets.splice(i, 1); continue;
      }
      // hit other player
      const target = s.players[1 - b.owner];
      if (target.hp > 0) {
        const dx = b.pos.x - target.pos.x;
        const dy = b.pos.y - (target.pos.y - target.h / 2);
        if (Math.abs(dx) < target.w / 2 + 4 && Math.abs(dy) < target.h / 2 + 4) {
          damage(target, b.dmg, Math.sign(b.vel.x) * 250, -150);
          spawnParticles(b.pos.x, b.pos.y, 6, "#8d6e63", 300, { type: "splinter" });
          spawnParticles(b.pos.x, b.pos.y, 6, target.color, 250, { type: "leaf" });
          s.bullets.splice(i, 1); continue;
        }
      }
      // hit platforms
      for (const pf of s.platforms) {
        if (b.pos.x > pf.x && b.pos.x < pf.x + pf.w && b.pos.y > pf.y && b.pos.y < pf.y + pf.h) {
          spawnParticles(b.pos.x, b.pos.y, 8, "#bcaaa4", 200, { type: "dust" });
          s.bullets.splice(i, 1); break;
        }
      }
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
    ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.strokeStyle = p.hitFlash > 0 ? "#fff" : p.color;
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";

    const headR = 11;
    const headY = y - 50;
    // head
    ctx.beginPath();
    ctx.arc(x, headY, headR, 0, Math.PI * 2);
    ctx.stroke();
    // body
    ctx.beginPath();
    ctx.moveTo(x, headY + headR);
    ctx.lineTo(x, y - 18);
    ctx.stroke();
    // legs (animated)
    const moving = Math.abs(p.vel.x) > 50 && p.onGround;
    const t = time * 12;
    const legA = moving ? Math.sin(t) * 0.8 : 0.3;
    const legB = moving ? -Math.sin(t) * 0.8 : -0.3;
    const slideOffset = p.slideTimer > 0 ? 8 : 0;
    ctx.beginPath();
    ctx.moveTo(x, y - 18);
    ctx.lineTo(x + Math.sin(legA) * 14, y - slideOffset);
    ctx.moveTo(x, y - 18);
    ctx.lineTo(x + Math.sin(legB) * 14, y - slideOffset);
    ctx.stroke();
    // arms (attack swing)
    const armT = p.attackTimer > 0 ? (1 - p.attackTimer / 0.22) : 0;
    let armAngle = -Math.PI / 4;
    
    if (p.attackTimer > 0) {
      if (p.weapon.kind === "katana") {
        // Beautiful horizontal slash:
        // swingDir === 1: sweeps from behind head (-Math.PI * 0.9) to front-horizontal (Math.PI * 0.1)
        // swingDir === -1: sweeps from front-up (-Math.PI * 0.05) to behind-horizontal (-Math.PI * 0.85)
        const startVal = -Math.PI / 4;
        const peakVal = p.swingDir === 1 ? -Math.PI * 0.9 : -Math.PI * 0.05;
        const slashVal = p.swingDir === 1 ? Math.PI * 0.1 : -Math.PI * 0.85;
        
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
      } else {
        const swing = Math.sin(armT * Math.PI) * 1.3;
        armAngle = -Math.PI / 4 + swing * p.facing;
      }
    }
    
    const handX = x + Math.cos(armAngle) * 22 * p.facing;
    const handY = headY + headR + 10 + Math.sin(armAngle) * 22;
    ctx.beginPath();
    ctx.moveTo(x, headY + headR + 6);
    ctx.lineTo(handX, handY);
    // off arm
    ctx.moveTo(x, headY + headR + 6);
    ctx.lineTo(x - 14 * p.facing, headY + headR + 22);
    ctx.stroke();

    // Wind sweep slash trail for katana
    if (p.weapon.kind === "katana" && p.attackTimer > 0 && armT >= 0.2 && armT <= 0.8) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)"; // Soft white wind sweep
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath();
      
      const shoulderX = x;
      const shoulderY = headY + headR + 6;
      const radius = 86;
      
      const a1 = p.swingDir === 1 ? -Math.PI * 0.9 : -Math.PI * 0.05;
      const a2 = armAngle;
      
      if (p.facing === 1) {
        ctx.arc(shoulderX, shoulderY, radius, a1, a2, p.swingDir === -1);
      } else {
        const mirrorA1 = Math.PI - a1;
        const mirrorA2 = Math.PI - a2;
        ctx.arc(shoulderX, shoulderY, radius, mirrorA1, mirrorA2, p.swingDir === 1);
      }
      ctx.stroke();
      
      ctx.strokeStyle = "rgba(230, 240, 255, 0.7)"; // Inner brighter wind line
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      if (p.facing === 1) {
        ctx.arc(shoulderX, shoulderY, radius, a1, a2, p.swingDir === -1);
      } else {
        const mirrorA1 = Math.PI - a1;
        const mirrorA2 = Math.PI - a2;
        ctx.arc(shoulderX, shoulderY, radius, mirrorA1, mirrorA2, p.swingDir === 1);
      }
      ctx.stroke();
      ctx.restore();
    }

    // weapon
    drawWeapon(ctx, p, handX, handY, armAngle);

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
        ctx.strokeStyle = "#8d6e63"; // Slingshot frame
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(15, -8);
        ctx.moveTo(0, 0); ctx.lineTo(15, 8);
        ctx.stroke();
        ctx.strokeStyle = "#d7ccc8";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(15, -8); ctx.lineTo(15, 8);
        ctx.stroke();
        break;
      case "shotgun":
        ctx.strokeStyle = "#5d4037"; // Dark wood bow
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(10, 0, 24, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
        ctx.strokeStyle = "#e0e0e0";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(10, -24); ctx.lineTo(10, 24);
        ctx.stroke();
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

      ctx.fillStyle = "#5d4037";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(def.name[0], 0, 1);
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
      
      ctx.fillStyle = "#455a64"; // Slate stone bullet
      ctx.beginPath();
      ctx.arc(b.pos.x, b.pos.y, 3, 0, Math.PI * 2);
      ctx.fill();
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
      // panel (parchment card style)
      ctx.fillStyle = "rgba(252, 250, 242, 0.9)";
      ctx.strokeStyle = "#5d4037"; // dark wood
      ctx.lineWidth = 3;
      ctx.fillRect(x, y, 260, 80);
      ctx.strokeRect(x + 0.5, y + 0.5, 259, 79);
      
      // label
      ctx.fillStyle = p.color;
      ctx.font = "bold 15px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`PLAYER ${p.id + 1}`, x + 12, y + 20);
      ctx.fillStyle = "#5d4037";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(`WINS ${p.wins}`, x + 200, y + 20);
      
      // HP bar
      ctx.fillStyle = "#d7ccc8";
      ctx.fillRect(x + 12, y + 28, 236, 12);
      ctx.fillStyle = p.hp > 30 ? "#558b2f" : "#c62828"; // Moss green / rust red
      ctx.fillRect(x + 12, y + 28, 236 * Math.max(0, p.hp) / 100, 12);
      ctx.strokeStyle = "#5d4037";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 12, y + 28, 236, 12);
      
      // focus energy
      ctx.fillStyle = "#efebe9";
      ctx.fillRect(x + 12, y + 45, 236, 8);
      ctx.fillStyle = s.bulletTimeActive[p.id] ? "#f57c00" : "#ffb300"; // focus active vs charge
      ctx.fillRect(x + 12, y + 45, 236 * p.energy / 100, 8);
      ctx.strokeStyle = "#5d4037";
      ctx.strokeRect(x + 12, y + 45, 236, 8);

      // weapon
      const def = WEAPON_DEFS[p.weapon.kind];
      ctx.fillStyle = "#5d4037";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(def.name, x + 12, y + 68);
      if (p.weapon.ammo >= 0) {
        ctx.fillStyle = "#8d6e63";
        ctx.font = "900 11px sans-serif";
        ctx.fillText(`AMMO ${p.weapon.ammo}`, x + 180, y + 68);
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
        <StartScreen onStart={() => setStarted(true)} />
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
            onClick={() => setStarted(false)}
            className="absolute top-4 right-4 px-4 py-2 text-xs font-sans font-bold uppercase tracking-wider rounded-md bg-[#fcfaf2]/90 border-2 border-[#5d4037] text-[#5d4037] hover:bg-[#efebe9] transition-colors shadow-md"
          >
            Leave Woods
          </button>
        </div>
      )}
    </div>
  );
}

function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center gap-8 p-8 text-center max-w-4xl bg-[#fcfaf2]/85 border-2 border-[#5d4037] rounded-2xl shadow-2xl backdrop-blur-md">
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
          Stickman Fight · Zen Focus · Local 2P
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4 w-full">
        <ControlsCard
          color="#2e7d32"
          label="PLAYER 1 (FOREST)"
          rows={[
            ["Move", "A / D"],
            ["Jump / Double", "W"],
            ["Dash / Leaf Sweep", "Shift / Q"],
            ["Attack / Strike", "F"],
            ["Zen Focus", "E (hold)"],
          ]}
        />
        <ControlsCard
          color="#d84315"
          label="PLAYER 2 (AUTUMN)"
          rows={[
            ["Move", "← / →"],
            ["Jump / Double", "↑"],
            ["Dash / Leaf Sweep", "/"],
            ["Attack / Strike", "."],
            ["Zen Focus", ", (hold)"],
          ]}
        />
      </div>

      <button
        onClick={onStart}
        className="group relative px-12 py-4 font-sans font-bold text-xl uppercase tracking-[0.2em] text-[#fcfaf2] rounded-md transition-transform hover:scale-105 active:scale-95 border-b-4 border-[#1b5e20]"
        style={{
          background: "linear-gradient(90deg, #2e7d32, #d84315)",
          boxShadow: "0 6px 20px rgba(46, 125, 50, 0.35)",
        }}
      >
        Enter the Woods
      </button>

      <p className="text-xs text-[#8d6e63] max-w-md">
        Collect wooden scroll packages containing items. First to lose all energy/HP loses the round. Hold Zen Focus to slow time and dodge projectiles.
      </p>
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
