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
  fists:   { name: "FISTS",   ammo: -1, color: "#9ad" },
  katana:  { name: "KATANA",  ammo: -1, color: "#7ff" },
  pistol:  { name: "PISTOL",  ammo: 12, color: "#fd6" },
  shotgun: { name: "SHOTGUN", ammo: 6,  color: "#f86" },
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
      makePlayer(0, 200, H - 200, "#22e9ff", "#22e9ff"),
      makePlayer(1, W - 230, H - 200, "#ff3df0", "#ff3df0"),
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
        life: rand(0.3, 0.7),
        maxLife: 0.7,
        color,
        size: rand(2, 4),
        gravity: true,
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
          spawnParticles(other.pos.x, other.pos.y - 30, 18, "#7ff", 400);
        }
        spawnParticles(muzzleX, muzzleY, 6, "#7ff", 250);
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
          owner: p.id, life: 1.2, dmg: 18, trail: [], color: "#fd6",
        });
        s.shake = Math.max(s.shake, 4);
        spawnParticles(muzzleX, muzzleY, 4, "#fd6", 220, { gravity: false });
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
            owner: p.id, life: 0.4, dmg: 9, trail: [], color: "#f86",
          });
        }
        s.shake = Math.max(s.shake, 10);
        spawnParticles(muzzleX, muzzleY, 14, "#f86", 350, { gravity: false });
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
    spawnParticles(p.pos.x, p.pos.y - 30, Math.min(30, dmg), "#f44", 300);
    if (p.hp <= 0 && !s.roundOver) {
      s.roundOver = true;
      s.roundOverTimer = 2.5;
      s.targetTimeScale = 0.15;
      const winner = s.players[1 - p.id];
      winner.wins++;
      s.winnerText = `PLAYER ${winner.id + 1} WINS`;
      setScoreTick(t => t + 1);
      // big explosion
      spawnParticles(p.pos.x, p.pos.y - 30, 60, "#f44", 600);
      spawnParticles(p.pos.x, p.pos.y - 30, 30, "#fff", 400);
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
        spawnParticles(p.pos.x, p.pos.y, 8, "#fff", 200);
      }
      // dash
      if (c.dashPressed && p.dashCd <= 0) {
        p.vel.x = p.facing * DASH_V;
        p.vel.y = Math.min(p.vel.y, -100);
        p.dashCd = 0.6;
        p.invuln = Math.max(p.invuln, 0.15);
        spawnParticles(p.pos.x, p.pos.y - 20, 14, p.glow, 350);
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
          spawnParticles(pk.pos.x, pk.pos.y, 12, def.color, 250);
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
          spawnParticles(b.pos.x, b.pos.y, 10, b.color, 300);
          s.bullets.splice(i, 1); continue;
        }
      }
      // hit platforms
      for (const pf of s.platforms) {
        if (b.pos.x > pf.x && b.pos.x < pf.x + pf.w && b.pos.y > pf.y && b.pos.y < pf.y + pf.h) {
          spawnParticles(b.pos.x, b.pos.y, 6, "#fff", 200);
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
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = p.hitFlash > 0 ? "#fff" : p.color;
    ctx.lineWidth = 4;
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
        // Beautiful 3-phase slash: wind-up, fast sweep, recovery
        const startVal = -Math.PI / 4;
        const peakVal = p.swingDir === 1 ? -Math.PI * 0.8 : Math.PI * 0.3;
        const slashVal = p.swingDir === 1 ? Math.PI * 0.3 : -Math.PI * 0.8;
        
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

    // neon slash trail for katana
    if (p.weapon.kind === "katana" && p.attackTimer > 0 && armT >= 0.2 && armT <= 0.8) {
      ctx.save();
      ctx.shadowColor = "#7ff";
      ctx.shadowBlur = 24;
      ctx.strokeStyle = "rgba(119, 255, 255, 0.4)";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath();
      
      const shoulderX = x;
      const shoulderY = headY + headR + 6;
      const radius = 86;
      
      const a1 = p.swingDir === 1 ? -Math.PI * 0.8 : Math.PI * 0.3;
      const a2 = armAngle;
      
      if (p.facing === 1) {
        ctx.arc(shoulderX, shoulderY, radius, a1, a2, p.swingDir === -1);
      } else {
        const mirrorA1 = Math.PI - a1;
        const mirrorA2 = Math.PI - a2;
        ctx.arc(shoulderX, shoulderY, radius, mirrorA1, mirrorA2, p.swingDir === 1);
      }
      ctx.stroke();
      
      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 8;
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
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = def.color;
    ctx.fillStyle = def.color;
    ctx.lineWidth = 3;
    switch (p.weapon.kind) {
      case "fists": break;
      case "katana":
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(70, -4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.stroke();
        break;
      case "pistol":
        ctx.fillRect(0, -3, 22, 6);
        ctx.fillRect(4, 2, 6, 10);
        break;
      case "shotgun":
        ctx.fillRect(0, -4, 38, 8);
        ctx.fillRect(8, 3, 8, 12);
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

    // background — cyber city
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, "#0a0420");
    bgGrad.addColorStop(0.5, "#1a0840");
    bgGrad.addColorStop(1, "#06030f");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // grid + skyline silhouettes
    ctx.strokeStyle = "rgba(120, 60, 200, 0.15)";
    ctx.lineWidth = 1;
    for (let i = 0; i < W; i += 60) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke();
    }
    for (let i = 0; i < H; i += 60) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke();
    }
    // skyline
    ctx.fillStyle = "rgba(20, 8, 40, 0.9)";
    const buildings = [80, 160, 110, 220, 140, 90, 180, 130, 200, 100, 170, 240, 120, 90, 180];
    let bx = 0;
    for (const bh of buildings) {
      ctx.fillRect(bx, H - 60 - bh, 80, bh);
      // windows
      ctx.fillStyle = "rgba(80, 200, 255, 0.4)";
      for (let wy = H - 60 - bh + 20; wy < H - 80; wy += 22) {
        for (let wx = bx + 10; wx < bx + 70; wx += 18) {
          if (((wx + wy) | 0) % 3 === 0) ctx.fillRect(wx, wy, 6, 8);
        }
      }
      ctx.fillStyle = "rgba(20, 8, 40, 0.9)";
      bx += 85;
    }

    // bullet-time vignette
    const slow = s.timeScale < 0.9;
    if (slow) {
      const v = ctx.createRadialGradient(W/2, H/2, 100, W/2, H/2, 700);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, `rgba(120, 0, 180, ${0.5 * (1 - s.timeScale)})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }

    // platforms
    for (const pf of s.platforms) {
      ctx.save();
      ctx.shadowColor = "#22e9ff";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#1a3a5a";
      ctx.fillRect(pf.x, pf.y, pf.w, pf.h);
      ctx.strokeStyle = "#22e9ff";
      ctx.lineWidth = 2;
      ctx.strokeRect(pf.x + 0.5, pf.y + 0.5, pf.w - 1, pf.h - 1);
      ctx.restore();
    }

    // pickups
    for (const pk of s.pickups) {
      const def = WEAPON_DEFS[pk.kind];
      const yBob = Math.sin(pk.bob) * 6;
      ctx.save();
      ctx.translate(pk.pos.x, pk.pos.y + yBob);
      ctx.shadowColor = def.color;
      ctx.shadowBlur = 20;
      ctx.strokeStyle = def.color;
      ctx.fillStyle = def.color + "33";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = def.color;
      ctx.font = "bold 9px JetBrains Mono";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowBlur = 8;
      ctx.fillText(def.name[0], 0, 1);
      ctx.restore();
    }

    // bullets with trails
    for (const b of s.bullets) {
      ctx.save();
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < b.trail.length; i++) {
        const pt = b.trail[i];
        if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
      }
      ctx.lineTo(b.pos.x, b.pos.y);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(b.pos.x, b.pos.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // particles
    for (const pa of s.particles) {
      const a = Math.max(0, pa.life / pa.maxLife);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.shadowColor = pa.color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = pa.color;
      ctx.fillRect(pa.pos.x - pa.size / 2, pa.pos.y - pa.size / 2, pa.size, pa.size);
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
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(0, H / 2 - 60, W, 120);
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "#ff3df0";
      ctx.shadowBlur = 30;
      ctx.font = "900 56px Orbitron";
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
      // panel
      ctx.fillStyle = "rgba(8, 4, 24, 0.7)";
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      ctx.fillRect(x, y, 260, 80);
      ctx.strokeRect(x + 0.5, y + 0.5, 259, 79);
      ctx.shadowBlur = 0;
      // label
      ctx.fillStyle = p.color;
      ctx.font = "bold 14px Orbitron";
      ctx.textAlign = "left";
      ctx.fillText(`P${p.id + 1}`, x + 10, y + 18);
      ctx.fillStyle = "#fff";
      ctx.font = "10px JetBrains Mono";
      ctx.fillText(`WINS ${p.wins}`, x + 40, y + 18);
      // HP bar
      ctx.fillStyle = "#220";
      ctx.fillRect(x + 10, y + 26, 240, 12);
      ctx.fillStyle = p.hp > 30 ? "#3ef58b" : "#f54";
      ctx.fillRect(x + 10, y + 26, 240 * Math.max(0, p.hp) / 100, 12);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.strokeRect(x + 10, y + 26, 240, 12);
      // energy
      ctx.fillStyle = "#022";
      ctx.fillRect(x + 10, y + 42, 240, 8);
      ctx.fillStyle = s.bulletTimeActive[p.id] ? "#ff3df0" : "#22e9ff";
      ctx.fillRect(x + 10, y + 42, 240 * p.energy / 100, 8);
      // weapon
      const def = WEAPON_DEFS[p.weapon.kind];
      ctx.fillStyle = def.color;
      ctx.font = "bold 11px JetBrains Mono";
      ctx.fillText(def.name, x + 10, y + 66);
      if (p.weapon.ammo >= 0) {
        ctx.fillStyle = "#fff";
        ctx.fillText(`AMMO ${p.weapon.ammo}`, x + 100, y + 66);
      }
      ctx.restore();
    }
    // time scale indicator
    if (s.timeScale < 0.9) {
      ctx.save();
      ctx.fillStyle = "#ff3df0";
      ctx.shadowColor = "#ff3df0";
      ctx.shadowBlur = 20;
      ctx.font = "bold 18px Orbitron";
      ctx.textAlign = "center";
      ctx.fillText("◆ BULLET TIME ◆", W / 2, 40);
      ctx.restore();
    }
  }

  // void noop to use setScoreTick triggers
  void scoreTick;

  return (
    <div className="relative w-full h-full bg-background flex flex-col items-center justify-center">
      {!started ? (
        <StartScreen onStart={() => setStarted(true)} />
      ) : (
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="border border-border rounded-lg shadow-2xl"
            style={{
              maxWidth: "100vw",
              maxHeight: "100vh",
              boxShadow: "0 0 80px rgba(34, 233, 255, 0.25), 0 0 120px rgba(255, 61, 240, 0.15)",
            }}
          />
          <button
            onClick={() => setStarted(false)}
            className="absolute top-2 right-2 px-3 py-1 text-xs font-mono uppercase tracking-wider rounded bg-card/80 border border-border text-muted-foreground hover:text-foreground"
          >
            Menu
          </button>
        </div>
      )}
    </div>
  );
}

function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center gap-8 p-8 text-center max-w-4xl">
      <div>
        <h1
          className="font-display font-black text-7xl md:text-8xl tracking-tight"
          style={{
            background: "linear-gradient(90deg, var(--neon-cyan), var(--neon-magenta))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow: "0 0 60px rgba(34, 233, 255, 0.3)",
          }}
        >
          NEON STRIKE
        </h1>
        <p className="mt-3 text-muted-foreground uppercase tracking-[0.4em] text-sm">
          Stickman Fight · Bullet Time · Local 2P
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4 w-full">
        <ControlsCard
          color="var(--neon-cyan)"
          label="PLAYER 1"
          rows={[
            ["Move", "A / D"],
            ["Jump / Double", "W"],
            ["Dash", "Shift / Q"],
            ["Attack / Fire", "F"],
            ["Bullet Time", "E (hold)"],
          ]}
        />
        <ControlsCard
          color="var(--neon-magenta)"
          label="PLAYER 2"
          rows={[
            ["Move", "← / →"],
            ["Jump / Double", "↑"],
            ["Dash", "/ "],
            ["Attack / Fire", "."],
            ["Bullet Time", ", (hold)"],
          ]}
        />
      </div>

      <button
        onClick={onStart}
        className="group relative px-12 py-4 font-display font-bold text-xl uppercase tracking-[0.3em] text-background rounded-md transition-transform hover:scale-105 active:scale-95"
        style={{
          background: "linear-gradient(90deg, var(--neon-cyan), var(--neon-magenta))",
          boxShadow: "0 0 30px rgba(34, 233, 255, 0.5), 0 0 60px rgba(255, 61, 240, 0.3)",
        }}
      >
        Fight
      </button>

      <p className="text-xs text-muted-foreground max-w-md">
        Grab weapons that drop on the map. First to lose all HP loses the round. Hold bullet-time to dodge incoming fire.
      </p>
    </div>
  );
}

function ControlsCard({ color, label, rows }: { color: string; label: string; rows: [string, string][] }) {
  return (
    <div
      className="rounded-lg border border-border bg-card/60 p-5 text-left backdrop-blur"
      style={{ boxShadow: `inset 0 0 0 1px ${color}33, 0 0 24px ${color}22` }}
    >
      <div className="font-display font-bold text-lg mb-3" style={{ color }}>
        {label}
      </div>
      <dl className="space-y-1.5 text-sm font-mono">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
