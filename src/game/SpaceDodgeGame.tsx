import React, { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Shield, Clock, Star, Heart, Play, RotateCcw, Home, Pause, Tv } from "lucide-react";

// --- PROCEDURAL AUDIO SYNTHESIZER ---
class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted: boolean = false;
  private musicInterval: any = null;
  private currentBeat: number = 0;
  private engineOsc: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private musicPitchFactor: number = 1.0;

  init() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    try {
      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.2, this.ctx.currentTime); // default volume 20%
      this.masterGain.connect(this.ctx.destination);
      
      this.startEngineSound();
      this.startAmbientMusic();
    } catch (err) {
      console.warn("AudioContext failed to initialize", err);
    }
  }

  setMute(mute: boolean) {
    this.isMuted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(mute ? 0 : 0.2, this.ctx.currentTime);
    }
  }

  toggleMute() {
    this.setMute(!this.isMuted);
    return this.isMuted;
  }

  setMusicPitchFactor(factor: number) {
    this.musicPitchFactor = factor;
    if (this.engineOsc && this.ctx) {
      // lower pitch when time slow is active
      this.engineOsc.frequency.setValueAtTime(80 * factor, this.ctx.currentTime);
    }
  }

  // Continuous hum for rocket engine
  private startEngineSound() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    
    // Low rumble
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(80, now);
    
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(40, now); // sub-bass

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(150, now);

    gain.gain.setValueAtTime(0.08, now);

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc2.start(now);

    this.engineOsc = osc;
    this.engineOsc2 = osc2;
    this.engineGain = gain;
  }

  // Generates sound effect for laser/collision
  playExplosion() {
    this.init();
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    // Crash sound: White noise burst + low triangle sweeps
    const bufferSize = this.ctx.sampleRate * 0.4; // 400ms explosion
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.setValueAtTime(400, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(10, now + 0.4);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    // Low sub rumble for impact
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = "triangle";
    subOsc.frequency.setValueAtTime(120, now);
    subOsc.frequency.linearRampToValueAtTime(30, now + 0.35);

    subGain.gain.setValueAtTime(0.5, now);
    subGain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    subOsc.connect(subGain);
    subGain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + 0.4);
    subOsc.start(now);
    subOsc.stop(now + 0.35);
  }

  // High-pitch sci-fi chime for powerup pickup
  playPowerUp() {
    this.init();
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99]; // C chord arpeggio
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq * 1.5, now + idx * 0.05);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.05 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.25);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.3);
    });
  }

  // Warning alarm sound during transitions
  playTransitionAlert() {
    this.init();
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    for (let i = 0; i < 3; i++) {
      const startTime = now + i * 0.3;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(587.33, startTime); // D5
      osc.frequency.linearRampToValueAtTime(880, startTime + 0.15); // A5

      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1000, startTime);

      gain.gain.setValueAtTime(0.08, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + 0.28);
    }
  }

  // Procedural generative space music sequencer
  private startAmbientMusic() {
    if (!this.ctx || !this.masterGain) return;

    // Simple bass & lead arpeggio that plays endlessly
    const bassScale = [55, 65.41, 73.42, 82.41]; // A1, C2, D2, E2
    const leadNotes = [
      [220, 261.63, 329.63, 440], // Amin
      [261.63, 329.63, 392.00, 523.25], // Cmaj
      [293.66, 349.23, 440.00, 587.33], // Dmin
      [329.63, 415.30, 493.88, 659.25]  // Emaj
    ];

    this.musicInterval = setInterval(() => {
      if (this.isMuted || !this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;

      // Every beat: Bass note
      if (this.currentBeat % 4 === 0) {
        const bassFreq = bassScale[Math.floor(this.currentBeat / 4) % bassScale.length];
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(bassFreq * this.musicPitchFactor, now);
        
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 1.2);
      }

      // Every beat: Arpeggio note
      const chords = leadNotes[Math.floor(this.currentBeat / 4) % leadNotes.length];
      const leadFreq = chords[this.currentBeat % chords.length];
      
      const leadOsc = this.ctx.createOscillator();
      const leadGain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      leadOsc.type = "sine";
      leadOsc.frequency.setValueAtTime(leadFreq * this.musicPitchFactor, now);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(800, now);

      leadGain.gain.setValueAtTime(0.04, now);
      leadGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      leadOsc.connect(filter);
      filter.connect(leadGain);
      leadGain.connect(this.masterGain);

      leadOsc.start(now);
      leadOsc.stop(now + 0.3);

      // Hi-hat tick sound on offbeats
      if (this.currentBeat % 2 === 1) {
        const tickOsc = this.ctx.createOscillator();
        const tickGain = this.ctx.createGain();
        tickOsc.type = "triangle";
        tickOsc.frequency.setValueAtTime(10000, now);
        
        tickGain.gain.setValueAtTime(0.008, now);
        tickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        
        tickOsc.connect(tickGain);
        tickGain.connect(this.masterGain);
        tickOsc.start(now);
        tickOsc.stop(now + 0.06);
      }

      this.currentBeat = (this.currentBeat + 1) % 16;
    }, 300); // 100 BPM arpeggiator
  }

  stop() {
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
    if (this.engineOsc) {
      try { this.engineOsc.stop(); } catch (e) {}
      this.engineOsc = null;
    }
    if (this.engineOsc2) {
      try { this.engineOsc2.stop(); } catch (e) {}
      this.engineOsc2 = null;
    }
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}

// --- CONSTANTS ---
type GameState = "MENU" | "PLAYING" | "TRANSITION" | "GAMEOVER" | "PAUSED";
type PowerUpType = "SHIELD" | "TIME_SLOW" | "DOUBLE_POINTS" | "EXTRA_LIFE";

interface Obstacle {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  type: string;
  angle: number;
  rotSpeed: number;
  pathType: "straight" | "zigzag" | "sine";
  amplitude: number;
  startX: number;
  canSplit: boolean;
  active: boolean;
  color: string;
}

interface PowerUpItem {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: PowerUpType;
  speed: number;
  active: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  active: boolean;
}

interface Stars {
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
}

interface Cloud {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
}

interface DetachedPart {
  type: "tank" | "srb_left" | "srb_right";
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  rotSpeed: number;
  width: number;
  height: number;
  active: boolean;
}

// Color interpolation helper for smooth zone transitions
const lerpColor = (color1: string, color2: string, factor: number): string => {
  const parse = (hex: string) => {
    let cleaned = hex.replace("#", "");
    if (cleaned.length === 3) {
      cleaned = cleaned.split("").map(c => c + c).join("");
    }
    const num = parseInt(cleaned, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  };

  const c1 = parse(color1);
  const c2 = parse(color2);

  const r = Math.round(c1.r + (c2.r - c1.r) * factor);
  const g = Math.round(c1.g + (c2.g - c1.g) * factor);
  const b = Math.round(c1.b + (c2.b - c1.b) * factor);

  return `rgb(${r}, ${g}, ${b})`;
};

// Define the 6 Zones
interface ZoneInfo {
  name: string;
  transitionText: string;
  gradientStart: string;
  gradientEnd: string;
  obstacles: string[];
}

const ZONES: ZoneInfo[] = [
  {
    name: "DÜNYA",
    transitionText: "🚀 Kalkış... Göklere Yüksel!",
    gradientStart: "#4a90e2",
    gradientEnd: "#87ceeb",
    obstacles: ["BIRD", "PLANE", "HELICOPTER", "DRONE"]
  },
  {
    name: "ATMOSFER",
    transitionText: "☁️ Atmosfer Geçiliyor...",
    gradientStart: "#1a2a6c",
    gradientEnd: "#4a90e2",
    obstacles: ["WEATHER_BALLOON", "HIGH_ALTITUDE_PLANE", "BALLOON_PARTICLE"]
  },
  {
    name: "UZAY",
    transitionText: "🌌 Uzaya Hoş Geldin!",
    gradientStart: "#000000",
    gradientEnd: "#0b1026",
    obstacles: ["METEOR", "SATELLITE", "SPACE_DEBRIS", "ROCKET_PIECE"]
  },
  {
    name: "MARS BÖLGESİ",
    transitionText: "🔴 Mars Yörüngesine Giriliyor...",
    gradientStart: "#300808",
    gradientEnd: "#000000",
    obstacles: ["MARS_METEOR", "MARS_ROCK", "SPACE_PROBE"]
  },
  {
    name: "GÜNEŞ SİSTEMİ YOLCULUĞU",
    transitionText: "🪐 Satürn Yakınlarında...",
    gradientStart: "#050e1e",
    gradientEnd: "#140c26",
    obstacles: ["ORBITAL_STONE", "COMET_FRAGMENT", "PROBE"]
  },
  {
    name: "DERİN UZAY",
    transitionText: "🌠 Derin Uzay Anomalileri!",
    gradientStart: "#1c0128",
    gradientEnd: "#000000",
    obstacles: ["ANOMALY", "DARK_ENERGY_SPHERE", "GIANT_METEOR"]
  }
];

interface PilotSkin {
  id: string;
  name: string;
  emoji: string;
  unlockScore: number;
  color: string;
}

interface RocketSkin {
  id: string;
  name: string;
  colorName: string;
  unlockScore: number;
  primaryColor: string;
  accentColor: string;
}

const PILOTS: PilotSkin[] = [
  { id: "astro", name: "Astro Boy", emoji: "👨‍🚀", unlockScore: 0, color: "#00e5ff" },
  { id: "cat", name: "Kozmik Kedi", emoji: "🐱", unlockScore: 100, color: "#ffb74d" },
  { id: "robot", name: "Robot X-1", emoji: "🤖", unlockScore: 200, color: "#b3e5fc" },
  { id: "alien", name: "Alien Bob", emoji: "👽", unlockScore: 300, color: "#81c784" },
  { id: "king", name: "Kral Pilot", emoji: "👑", unlockScore: 400, color: "#ffd54f" }
];

const ROCKET_SKINS: RocketSkin[] = [
  { id: "classic", name: "Classic Red", colorName: "Gümüş / Kırmızı", unlockScore: 0, primaryColor: "#cfd8dc", accentColor: "#ff1744" },
  { id: "cyber", name: "Neon Strike", colorName: "Siber Mor", unlockScore: 100, primaryColor: "#00bcd4", accentColor: "#9c27b0" },
  { id: "mars", name: "Mars Rover", colorName: "Kızıl Pas", unlockScore: 200, primaryColor: "#e64a19", accentColor: "#ff5722" },
  { id: "gold", name: "Golden Aegis", colorName: "Altın / Beyaz", unlockScore: 300, primaryColor: "#f5f5f5", accentColor: "#ffc107" },
  { id: "void", name: "Void Shadow", colorName: "Karbon Siyah", unlockScore: 400, primaryColor: "#263238", accentColor: "#00e5ff" }
];

const drawPilotFace = (ctx: CanvasRenderingContext2D, px: number, py: number, r: number, characterId: string) => {
  ctx.save();
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.clip();
  
  // Space suit neck
  ctx.fillStyle = "#37474f";
  ctx.fillRect(px - r * 0.5, py + r * 0.3, r * 1.0, r * 0.8);

  if (characterId === "astro") {
    // Astro Boy: Blue visor
    ctx.fillStyle = "#0d47a1";
    ctx.beginPath();
    ctx.arc(px, py, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.beginPath();
    ctx.ellipse(px - r * 0.25, py - r * 0.25, r * 0.4, r * 0.15, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (characterId === "cat") {
    // Cosmic Cat: Yellow face with cat ears and whiskers
    ctx.fillStyle = "#ffcc80";
    ctx.beginPath();
    ctx.arc(px, py + 2, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    
    // Ears
    ctx.fillStyle = "#ffb74d";
    ctx.beginPath();
    ctx.moveTo(px - r * 0.5, py - r * 0.2);
    ctx.lineTo(px - r * 0.3, py - r * 0.75);
    ctx.lineTo(px - r * 0.1, py - r * 0.35);
    ctx.closePath();
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(px + r * 0.1, py - r * 0.35);
    ctx.lineTo(px + r * 0.3, py - r * 0.75);
    ctx.lineTo(px + r * 0.5, py - r * 0.2);
    ctx.closePath();
    ctx.fill();
    
    // Inner ears
    ctx.fillStyle = "#ff8a80";
    ctx.beginPath();
    ctx.moveTo(px - r * 0.4, py - r * 0.25);
    ctx.lineTo(px - r * 0.3, py - r * 0.62);
    ctx.lineTo(px - r * 0.18, py - r * 0.35);
    ctx.closePath();
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(px + r * 0.18, py - r * 0.35);
    ctx.lineTo(px + r * 0.3, py - r * 0.62);
    ctx.lineTo(px + r * 0.4, py - r * 0.25);
    ctx.closePath();
    ctx.fill();
    
    // Eyes
    ctx.fillStyle = "#212121";
    ctx.beginPath();
    ctx.arc(px - r * 0.22, py, 2.5, 0, Math.PI * 2);
    ctx.arc(px + r * 0.22, py, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Nose/Mouth
    ctx.strokeStyle = "#212121";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, py + 3);
    ctx.lineTo(px, py + 5);
    ctx.moveTo(px, py + 5);
    ctx.quadraticCurveTo(px - 3, py + 8, px - 5, py + 6);
    ctx.moveTo(px, py + 5);
    ctx.quadraticCurveTo(px + 3, py + 8, px + 5, py + 6);
    ctx.stroke();

    // Whiskers
    ctx.beginPath();
    ctx.moveTo(px - r * 0.25, py + 3); ctx.lineTo(px - r * 0.65, py + 2);
    ctx.moveTo(px - r * 0.25, py + 5); ctx.lineTo(px - r * 0.65, py + 6);
    ctx.moveTo(px + r * 0.25, py + 3); ctx.lineTo(px + r * 0.65, py + 2);
    ctx.moveTo(px + r * 0.25, py + 5); ctx.lineTo(px + r * 0.65, py + 6);
    ctx.stroke();
  } else if (characterId === "robot") {
    // Robot X-1: Metallic blocky head, glowing eyes
    ctx.fillStyle = "#78909c";
    ctx.fillRect(px - r * 0.6, py - r * 0.5, r * 1.2, r * 1.0);
    
    ctx.fillStyle = "#212121";
    ctx.fillRect(px - r * 0.45, py - r * 0.3, r * 0.9, r * 0.45);
    
    ctx.fillStyle = "#00e5ff";
    ctx.fillRect(px - r * 0.3, py - r * 0.1, 4, 3);
    ctx.fillRect(px + r * 0.1, py - r * 0.1, 4, 3);
  } else if (characterId === "alien") {
    // Alien Bob: Green head, large black eyes
    ctx.fillStyle = "#a5d6a7";
    ctx.beginPath();
    ctx.ellipse(px, py + 2, r * 0.65, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = "#1b5e20";
    ctx.beginPath();
    ctx.arc(px - r * 0.25, py, r * 0.22, 0, Math.PI * 2);
    ctx.arc(px + r * 0.25, py, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(px - r * 0.25, py, r * 0.18, 0, Math.PI * 2);
    ctx.arc(px + r * 0.25, py, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
  } else if (characterId === "king") {
    // King Pilot: Crown, shades
    ctx.fillStyle = "#ffab91";
    ctx.beginPath();
    ctx.arc(px, py + 3, r * 0.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#212121";
    ctx.fillRect(px - r * 0.55, py - r * 0.1, r * 1.1, 6);
    
    // Crown
    ctx.fillStyle = "#ffd54f";
    ctx.beginPath();
    ctx.moveTo(px - r * 0.45, py - r * 0.18);
    ctx.lineTo(px - r * 0.35, py - r * 0.6);
    ctx.lineTo(px - r * 0.15, py - r * 0.35);
    ctx.lineTo(px, py - r * 0.7);
    ctx.lineTo(px + r * 0.15, py - r * 0.35);
    ctx.lineTo(px + r * 0.35, py - r * 0.6);
    ctx.lineTo(px + r * 0.45, py - r * 0.18);
    ctx.closePath();
    ctx.fill();
  }

  // Visor glass reflection overlay (semi-transparent white/cyan shine)
  const visorGrad = ctx.createLinearGradient(px - r, py - r, px + r, py + r);
  visorGrad.addColorStop(0, "rgba(255, 255, 255, 0.4)");
  visorGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.0)");
  visorGrad.addColorStop(1, "rgba(0, 229, 255, 0.12)");
  ctx.fillStyle = visorGrad;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
};

export const SpaceDodgeGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const soundManagerRef = useRef<SoundManager>(new SoundManager());

  // Game States
  const [gameState, setGameState] = useState<GameState>("MENU");
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(0);
  const [lives, setLives] = useState<number>(3);
  const [activeZoneIndex, setActiveZoneIndex] = useState<number>(0);
  const [muted, setMuted] = useState<boolean>(false);
  const [transitionText, setTransitionText] = useState<string>("");
  const [showTransition, setShowTransition] = useState<boolean>(false);
  const [selectedPilot, setSelectedPilot] = useState<string>("astro");
  const [selectedRocket, setSelectedRocket] = useState<string>("classic");
  const [activeTab, setActiveTab] = useState<"pilots" | "rockets">("pilots");

  // Powerup meters
  const [shieldTimeLeft, setShieldTimeLeft] = useState<number>(0);
  const [slowTimeLeft, setSlowTimeLeft] = useState<number>(0);
  const [doublePointsTimeLeft, setDoublePointsTimeLeft] = useState<number>(0);
  const [adContinueUsed, setAdContinueUsed] = useState<boolean>(false);

  // --- MENU ANIMATED BACKGROUND STATE ---
  const menuAnimRef = useRef<{
    stars: { x: number; y: number; size: number; speed: number; twinkle: number; twinkleSpeed: number }[];
    rocket: { x: number; y: number; angle: number; time: number };
    shootingStars: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; active: boolean }[];
    initialized: boolean;
  }>({
    stars: [],
    rocket: { x: 200, y: 300, angle: 0, time: 0 },
    shootingStars: [],
    initialized: false
  });

  // Gameplay configuration refs (to avoid closures in animation frame loop)
  const stateRef = useRef<{
    gameState: GameState;
    score: number;
    lives: number;
    rocketX: number;
    rocketY: number;
    rocketWidth: number;
    rocketHeight: number;
    targetRocketX: number;
    keys: { [key: string]: boolean };
    obstacles: Obstacle[];
    powerups: PowerUpItem[];
    particles: Particle[];
    stars: Stars[];
    clouds: Cloud[];
    bgPlanetY: number;
    bgPlanetName: string;
    bgPlanetScale: number;
    bgPlanetTargetScale: number;
    nebulaAngle: number;
    screenShake: number;
    gameTime: number; // in seconds
    lastTime: number;
    obstacleSpawnTimer: number;
    powerupSpawnTimer: number;
    difficultyMultiplier: number;
    // Active powerups durations (ms)
    shieldDuration: number;
    slowDuration: number;
    doublePointsDuration: number;
    highScore: number;
    activeZoneIndex: number;
    selectedPilot: string;
    selectedRocket: string;
    boostersDetached: boolean;
    detachedParts: DetachedPart[];
    screenFlash: number;
    bgPlanetOpacity: number;
    bgPlanetTargetOpacity: number;
    nextBgPlanetName: string;
  }>({
    gameState: "MENU",
    score: 0,
    lives: 3,
    rocketX: 0,
    rocketY: 0,
    rocketWidth: 72,
    rocketHeight: 112,
    targetRocketX: 0,
    keys: {},
    obstacles: [],
    powerups: [],
    particles: [],
    stars: [],
    clouds: [],
    bgPlanetY: -100,
    bgPlanetName: "",
    bgPlanetScale: 0.1,
    bgPlanetTargetScale: 0.1,
    nebulaAngle: 0,
    screenShake: 0,
    gameTime: 0,
    lastTime: 0,
    obstacleSpawnTimer: 0,
    powerupSpawnTimer: 0,
    difficultyMultiplier: 1.0,
    shieldDuration: 0,
    slowDuration: 0,
    doublePointsDuration: 0,
    highScore: 0,
    activeZoneIndex: 0,
    selectedPilot: "astro",
    boostersDetached: false,
    detachedParts: [],
    screenFlash: 0,
    bgPlanetOpacity: 0,
    bgPlanetTargetOpacity: 1,
    nextBgPlanetName: ""
  });

  // Load high score
  useEffect(() => {
    const saved = localStorage.getItem("space_dodge_high_score");
    if (saved) {
      const parsed = parseInt(saved, 10);
      setHighScore(parsed);
      stateRef.current.highScore = parsed;
    }

    // Clean up sounds on unmount
    return () => {
      soundManagerRef.current.stop();
    };
  }, []);

  // Update sound settings when state changes
  useEffect(() => {
    soundManagerRef.current.setMute(muted);
  }, [muted]);

  // Object Pools Initialization helper
  const initObjectPools = (canvasWidth: number, canvasHeight: number) => {
    const state = stateRef.current;
    state.rocketX = canvasWidth / 2 - state.rocketWidth / 2;
    state.rocketY = canvasHeight - state.rocketHeight - 120;
    state.targetRocketX = state.rocketX;

    // Stars pool
    state.stars = [];
    for (let i = 0; i < 150; i++) {
      state.stars.push({
        x: Math.random() * canvasWidth,
        y: Math.random() * canvasHeight,
        size: Math.random() * 2 + 0.5,
        speed: Math.random() * 3.5 + 0.5,
        opacity: Math.random() * 0.8 + 0.2
      });
    }
 
    // Clouds pool for Earth zone
    state.clouds = [];
    for (let i = 0; i < 5; i++) {
      state.clouds.push({
        x: Math.random() * canvasWidth,
        y: Math.random() * canvasHeight - canvasHeight / 2,
        width: Math.random() * 120 + 80,
        height: Math.random() * 40 + 20,
        speed: Math.random() * 1.2 + 0.6
      });
    }

    // Obstacles pool (preallocate 25 items)
    state.obstacles = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      speed: 0,
      type: "",
      angle: 0,
      rotSpeed: 0,
      pathType: "straight",
      amplitude: 0,
      startX: 0,
      canSplit: false,
      active: false,
      color: "#fff"
    }));

    // Powerups pool (preallocate 5 items)
    state.powerups = Array.from({ length: 5 }, (_, i) => ({
      id: i,
      x: 0,
      y: 0,
      width: 35,
      height: 35,
      type: "SHIELD",
      speed: 3,
      active: false
    }));

    // Particles pool (preallocate 100 items)
    state.particles = Array.from({ length: 150 }, () => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 0,
      color: "",
      alpha: 0,
      life: 0,
      maxLife: 0,
      active: false
    }));

    state.bgPlanetY = -150;
    state.bgPlanetName = "";
    state.bgPlanetScale = 0.1;
    state.bgPlanetTargetScale = 0.1;
  };

  // Spark a new particle
  const spawnParticles = (x: number, y: number, color: string, count: number = 8, speedFactor: number = 1) => {
    const pool = stateRef.current.particles;
    let spawned = 0;
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].active) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (Math.random() * 4 + 1.5) * speedFactor;
        pool[i].active = true;
        pool[i].x = x;
        pool[i].y = y;
        pool[i].vx = Math.cos(angle) * speed;
        pool[i].vy = Math.sin(angle) * speed;
        pool[i].size = Math.random() * 4 + 2;
        pool[i].color = color;
        pool[i].alpha = 1;
        pool[i].maxLife = Math.random() * 30 + 15;
        pool[i].life = pool[i].maxLife;
        
        spawned++;
        if (spawned >= count) break;
      }
    }
  };

  // Get active zone details based on game time (0-30s = Zone 0, 30-60s = Zone 1, etc.)
  const getCurrentZoneIndex = (time: number) => {
    const index = Math.floor(time / 30);
    return Math.min(index, ZONES.length - 1);
  };

  // Run the transition alerts
  const triggerZoneTransition = (zoneIdx: number) => {
    const zone = ZONES[zoneIdx];
    setTransitionText(zone.transitionText);
    setShowTransition(true);
    soundManagerRef.current.playTransitionAlert();
    
    // Set a planet to approach in the background with smooth fade transitions
    const state = stateRef.current;
    let newPlanet = "";
    let targetScale = 0.45;
    
    if (zoneIdx === 2) {
      newPlanet = "MOON";
      targetScale = 0.45;
    } else if (zoneIdx === 3) {
      newPlanet = "MARS";
      targetScale = 0.4;
    } else if (zoneIdx === 4) {
      const planets = ["WORLD", "JUPITER", "SATURN", "URANUS", "NEPTUNE"];
      newPlanet = planets[Math.floor(Math.random() * planets.length)];
      targetScale = 0.55;
    } else if (zoneIdx === 5) {
      newPlanet = "NEBULA";
      targetScale = 0.6;
    }

    if (newPlanet) {
      if (state.bgPlanetName && state.bgPlanetName !== newPlanet) {
        // Fade out current planet first, then swap
        state.nextBgPlanetName = newPlanet;
        state.bgPlanetTargetOpacity = 0;
      } else {
        // Spawn immediately
        state.bgPlanetName = newPlanet;
        state.bgPlanetY = -150;
        state.bgPlanetScale = 0.1;
        state.bgPlanetTargetScale = targetScale;
        state.bgPlanetOpacity = 0;
        state.bgPlanetTargetOpacity = 1.0;
        state.nextBgPlanetName = "";
      }
    } else {
      state.bgPlanetTargetOpacity = 0;
    }

    setTimeout(() => {
      setShowTransition(false);
    }, 3000);
  };

  // Spawn Obstacles
  const spawnObstacle = (canvasWidth: number) => {
    const state = stateRef.current;
    const pool = state.obstacles;
    
    // Find an inactive obstacle slot
    const obj = pool.find((o) => !o.active);
    if (!obj) return;

    const zone = ZONES[getCurrentZoneIndex(state.gameTime)];
    const oType = zone.obstacles[Math.floor(Math.random() * zone.obstacles.length)];

    // Configure size and properties based on obstacle types
    let width = 30;
    let height = 30;
    let speed = (Math.random() * 3.2 + 3.2) * state.difficultyMultiplier;
    let pathType: "straight" | "zigzag" | "sine" = "straight";
    let rotSpeed = 0;
    let canSplit = false;
    let color = "#ff4a4a";

    // Different movement behaviors as difficulty spikes
    if (state.difficultyMultiplier > 1.2 && Math.random() < 0.25) {
      pathType = "zigzag";
    } else if (state.difficultyMultiplier > 1.5 && Math.random() < 0.3) {
      pathType = "sine";
    }

    // Split obstacles at Deep Space (Zone 5) or high difficulty
    if (state.difficultyMultiplier > 1.7 && Math.random() < 0.25) {
      canSplit = true;
    }

    switch (oType) {
      case "BIRD":
        width = 25; height = 20; color = "#eceff1"; speed *= 0.9;
        break;
      case "PLANE":
        width = 50; height = 35; color = "#90a4ae"; speed *= 1.2;
        break;
      case "HELICOPTER":
        width = 45; height = 30; color = "#ffb74d";
        break;
      case "DRONE":
        width = 25; height = 25; color = "#64b5f6"; pathType = "zigzag";
        break;
      case "WEATHER_BALLOON":
        width = 35; height = 45; color = "#f06292"; speed *= 0.8;
        break;
      case "HIGH_ALTITUDE_PLANE":
        width = 55; height = 25; color = "#4db6ac"; speed *= 1.3;
        break;
      case "BALLOON_PARTICLE":
        width = 15; height = 15; color = "#a1887f"; rotSpeed = 0.05;
        break;
      case "METEOR":
      case "MARS_METEOR":
      case "GIANT_METEOR":
        const scale = oType === "GIANT_METEOR" ? 2.0 : (oType === "MARS_METEOR" ? 1.4 : 1.0);
        width = 35 * scale;
        height = 35 * scale;
        color = oType === "MARS_METEOR" ? "#d84315" : "#8d6e63";
        rotSpeed = (Math.random() - 0.5) * 0.06;
        break;
      case "SATELLITE":
        width = 45; height = 40; color = "#7986cb"; rotSpeed = 0.02;
        break;
      case "SPACE_DEBRIS":
      case "ROCKET_PIECE":
        width = 30; height = 30; color = "#b0bec5"; rotSpeed = 0.04;
        break;
      case "SPACE_PROBE":
      case "PROBE":
        width = 35; height = 35; color = "#e0e0e0"; pathType = "sine";
        break;
      case "ANOMALY":
      case "DARK_ENERGY_SPHERE":
        width = 40; height = 40; color = "#ba68c8"; pathType = "sine"; rotSpeed = 0.1;
        break;
    }

    obj.active = true;
    obj.x = Math.random() * (canvasWidth - width);
    obj.y = -height;
    obj.width = width;
    obj.height = height;
    obj.speed = speed;
    obj.type = oType;
    obj.angle = Math.random() * Math.PI * 2;
    obj.rotSpeed = rotSpeed;
    obj.pathType = pathType;
    obj.startX = obj.x;
    obj.amplitude = Math.random() * 50 + 20;
    obj.canSplit = canSplit;
    obj.color = color;
  };

  // Spawn Power-Ups
  const spawnPowerUp = (canvasWidth: number) => {
    const state = stateRef.current;
    const pool = state.powerups;

    const obj = pool.find((o) => !o.active);
    if (!obj) return;

    // Random choice biased
    const r = Math.random();
    let type: PowerUpType = "SHIELD";
    if (r < 0.3) type = "SHIELD";
    else if (r < 0.6) type = "TIME_SLOW";
    else if (r < 0.85) type = "DOUBLE_POINTS";
    else type = "EXTRA_LIFE"; // Extra life is slightly rarer

    obj.active = true;
    obj.x = Math.random() * (canvasWidth - 30);
    obj.y = -40;
    obj.width = 32;
    obj.height = 32;
    obj.type = type;
    obj.speed = Math.random() * 1.5 + 2.0;
  };

  // Split an obstacle into two smaller ones
  const triggerObstacleSplit = (parent: Obstacle) => {
    const state = stateRef.current;
    const pool = state.obstacles;
    let splitCount = 0;

    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].active) {
        pool[i].active = true;
        pool[i].x = parent.x + (splitCount === 0 ? -15 : 15);
        pool[i].y = parent.y + 10;
        pool[i].width = parent.width * 0.6;
        pool[i].height = parent.height * 0.6;
        pool[i].speed = parent.speed * 1.2;
        pool[i].type = "METEOR_DEBRIS";
        pool[i].angle = Math.random() * Math.PI * 2;
        pool[i].rotSpeed = parent.rotSpeed * 1.5;
        pool[i].pathType = "straight";
        pool[i].color = parent.color;
        
        // Push sideways
        pool[i].startX = pool[i].x;
        pool[i].amplitude = 0;

        splitCount++;
        if (splitCount >= 2) break;
      }
    }
  };

  // Reset Game Values
  const handleStartGame = () => {
    // Init Audio Context on first gesture
    soundManagerRef.current.init();

    const state = stateRef.current;
    state.lives = 3;
    state.score = 0;
    state.gameTime = 0;
    state.difficultyMultiplier = 1.0;
    state.shieldDuration = 0;
    state.slowDuration = 0;
    state.doublePointsDuration = 0;
    state.activeZoneIndex = 0;
    state.highScore = highScore;
    state.selectedPilot = selectedPilot;
    state.selectedRocket = selectedRocket;
    state.boostersDetached = false;
    state.detachedParts = [];
    setAdContinueUsed(false);
    state.screenFlash = 0;
    state.bgPlanetOpacity = 0;
    state.bgPlanetTargetOpacity = 1;
    state.nextBgPlanetName = "";
    
    setLives(3);
    setScore(0);
    setActiveZoneIndex(0);
    setShieldTimeLeft(0);
    setSlowTimeLeft(0);
    setDoublePointsTimeLeft(0);

    // Initial canvas dimensions
    const canvas = canvasRef.current;
    if (canvas) {
      initObjectPools(canvas.width, canvas.height);
    }

    state.gameState = "PLAYING";
    setGameState("PLAYING");
    triggerZoneTransition(0);
  };

  // --- AD CONTINUE: Watch ad to revive and keep playing ---
  const handleAdContinue = () => {
    // Mark ad continue as used for this game session
    setAdContinueUsed(true);

    // --- AdMob Rewarded Ad Placeholder ---
    // When you integrate AdMob SDK, replace this block with:
    // import { AdMob, RewardAdOptions } from '@capacitor-community/admob';
    // const options: RewardAdOptions = { adId: 'ca-app-pub-XXXXX/YYYYY' };
    // await AdMob.showRewardVideoAd(options);
    // Then call the revival logic in the reward callback.
    //
    // For now, we simulate a successful ad watch:
    const showRewardedAd = (): Promise<boolean> => {
      return new Promise((resolve) => {
        // Simulate ad display delay
        setTimeout(() => resolve(true), 500);
      });
    };

    showRewardedAd().then((rewarded) => {
      if (rewarded) {
        const state = stateRef.current;
        // Revive the player: give 1 life, keep score, keep zone
        state.lives = 1;
        state.gameState = "PLAYING";
        state.shieldDuration = 3000; // 3 second shield after revive
        setLives(1);
        setShieldTimeLeft(3);
        setGameState("PLAYING");
        soundManagerRef.current.playPowerUp();
      }
    });
  };

  const handlePause = () => {
    const state = stateRef.current;
    if (state.gameState === "PLAYING") {
      state.gameState = "PAUSED";
      setGameState("PAUSED");
    } else if (state.gameState === "PAUSED") {
      state.gameState = "PLAYING";
      setGameState("PLAYING");
    }
  };

  const handleQuitToMenu = () => {
    const state = stateRef.current;
    state.gameState = "MENU";
    setGameState("MENU");
    soundManagerRef.current.stop();
  };

  // Animation and Physics update loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Make canvas responsive
    const handleResize = () => {
      const parent = containerRef.current;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        
        const state = stateRef.current;
        if (state.rocketX === 0) {
          state.rocketX = canvas.width / 2 - state.rocketWidth / 2;
          state.targetRocketX = state.rocketX;
        }
        state.rocketY = canvas.height - state.rocketHeight - 120;
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    // Key listeners
    const handleKeyDown = (e: KeyboardEvent) => {
      stateRef.current.keys[e.key] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      stateRef.current.keys[e.key] = false;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // Touch and Mouse listeners for fluid drag controls
    let isDragging = false;
    
    const onStart = (clientX: number) => {
      const state = stateRef.current;
      if (state.gameState !== "PLAYING") return;
      isDragging = true;
      
      const rect = canvas.getBoundingClientRect();
      const clickX = clientX - rect.left;
      state.targetRocketX = clickX - state.rocketWidth / 2;
    };

    const onMove = (clientX: number) => {
      const state = stateRef.current;
      if (!isDragging || state.gameState !== "PLAYING") return;
      
      const rect = canvas.getBoundingClientRect();
      const moveX = clientX - rect.left;
      state.targetRocketX = moveX - state.rocketWidth / 2;
    };

    const onEnd = () => {
      isDragging = false;
    };

    const handleMouseDown = (e: MouseEvent) => onStart(e.clientX);
    const handleMouseMove = (e: MouseEvent) => onMove(e.clientX);
    const handleMouseUp = onEnd;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) onStart(e.touches[0].clientX);
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) onMove(e.touches[0].clientX);
    };
    const handleTouchEnd = handleMouseUp;

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);

    canvas.addEventListener("touchstart", handleTouchStart, { passive: true });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: true });
    canvas.addEventListener("touchend", handleTouchEnd);

    // Initial setup
    initObjectPools(canvas.width, canvas.height);

    let animationId: number;

    const gameLoop = (timestamp: number) => {
      const state = stateRef.current;
      
      // Calculate delta time
      if (!state.lastTime) state.lastTime = timestamp;
      let dt = (timestamp - state.lastTime) / 1000;
      state.lastTime = timestamp;

      // Cap delta time to prevent massive jumps when switching tabs
      if (dt > 0.1) dt = 0.1;

      // Clear screen
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // ============ ANIMATED MENU BACKGROUND ============
      if (state.gameState === "MENU") {
        const menu = menuAnimRef.current;
        
        // Initialize menu stars on first frame
        if (!menu.initialized) {
          menu.stars = [];
          for (let i = 0; i < 200; i++) {
            menu.stars.push({
              x: Math.random() * canvas.width,
              y: Math.random() * canvas.height,
              size: Math.random() * 2.5 + 0.5,
              speed: Math.random() * 0.8 + 0.2,
              twinkle: Math.random() * Math.PI * 2,
              twinkleSpeed: Math.random() * 2 + 1
            });
          }
          menu.rocket = { x: canvas.width * 0.15, y: canvas.height * 0.55, angle: -0.15, time: 0 };
          menu.shootingStars = [];
          for (let i = 0; i < 5; i++) {
            menu.shootingStars.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, active: false });
          }
          menu.initialized = true;
        }

        // Deep space gradient background
        const menuGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        menuGrad.addColorStop(0, "#020618");
        menuGrad.addColorStop(0.4, "#0a0e2a");
        menuGrad.addColorStop(0.7, "#0f172a");
        menuGrad.addColorStop(1, "#020618");
        ctx.fillStyle = menuGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Distant nebula glow blobs
        ctx.save();
        ctx.globalAlpha = 0.08;
        const neb1 = ctx.createRadialGradient(canvas.width * 0.75, canvas.height * 0.25, 20, canvas.width * 0.75, canvas.height * 0.25, canvas.width * 0.35);
        neb1.addColorStop(0, "#7c3aed");
        neb1.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = neb1;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const neb2 = ctx.createRadialGradient(canvas.width * 0.2, canvas.height * 0.7, 10, canvas.width * 0.2, canvas.height * 0.7, canvas.width * 0.25);
        neb2.addColorStop(0, "#06b6d4");
        neb2.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = neb2;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        // Draw twinkling stars
        menu.stars.forEach(star => {
          star.y += star.speed;
          star.twinkle += star.twinkleSpeed * dt;
          if (star.y > canvas.height) {
            star.y = -5;
            star.x = Math.random() * canvas.width;
          }
          const alpha = 0.4 + Math.sin(star.twinkle) * 0.35;
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.05, alpha)})`;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fill();

          // Larger stars get a subtle cross glint
          if (star.size > 1.8 && alpha > 0.6) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.3})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(star.x - star.size * 2.5, star.y);
            ctx.lineTo(star.x + star.size * 2.5, star.y);
            ctx.moveTo(star.x, star.y - star.size * 2.5);
            ctx.lineTo(star.x, star.y + star.size * 2.5);
            ctx.stroke();
          }
        });

        // --- MILKY WAY GALAXY (top-left) ---
        const gx = canvas.width * 0.18;
        const gy = canvas.height * 0.22;
        const gSize = Math.min(canvas.width, canvas.height) * 0.22;

        ctx.save();
        ctx.translate(gx, gy);
        ctx.rotate(-0.4); // tilt the galaxy

        // Outer diffuse halo
        const haloGrad = ctx.createRadialGradient(0, 0, gSize * 0.1, 0, 0, gSize * 1.1);
        haloGrad.addColorStop(0, "rgba(200, 180, 255, 0.08)");
        haloGrad.addColorStop(0.5, "rgba(100, 120, 200, 0.03)");
        haloGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, gSize * 1.1, gSize * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();

        // Main galactic disc (flattened ellipse with milky glow)
        const discGrad = ctx.createRadialGradient(0, 0, gSize * 0.03, 0, 0, gSize * 0.85);
        discGrad.addColorStop(0, "rgba(255, 245, 220, 0.25)");
        discGrad.addColorStop(0.15, "rgba(220, 200, 180, 0.18)");
        discGrad.addColorStop(0.4, "rgba(160, 140, 200, 0.1)");
        discGrad.addColorStop(0.7, "rgba(80, 100, 180, 0.05)");
        discGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = discGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, gSize * 0.85, gSize * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();

        // Spiral arm dust lanes (drawn as rotated, offset ellipses)
        for (let arm = 0; arm < 4; arm++) {
          ctx.save();
          ctx.rotate((arm * Math.PI) / 2 + 0.3);
          const armGrad = ctx.createRadialGradient(gSize * 0.15, 0, gSize * 0.02, gSize * 0.15, 0, gSize * 0.55);
          armGrad.addColorStop(0, "rgba(200, 180, 240, 0.12)");
          armGrad.addColorStop(0.5, "rgba(140, 160, 220, 0.06)");
          armGrad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = armGrad;
          ctx.beginPath();
          ctx.ellipse(gSize * 0.2, gSize * 0.04, gSize * 0.45, gSize * 0.08, 0.25, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Bright galactic core (bulge)
        const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, gSize * 0.12);
        coreGrad.addColorStop(0, "rgba(255, 248, 220, 0.45)");
        coreGrad.addColorStop(0.4, "rgba(255, 230, 180, 0.25)");
        coreGrad.addColorStop(0.7, "rgba(200, 180, 160, 0.1)");
        coreGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, gSize * 0.14, gSize * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();

        // Tiny dense stars along the galactic plane
        ctx.globalAlpha = 0.6;
        for (let i = 0; i < 80; i++) {
          const sx = (Math.random() - 0.5) * gSize * 1.5;
          const sy = (Math.random() - 0.5) * gSize * 0.3;
          const dist = Math.sqrt(sx * sx + sy * sy * 9) / gSize;
          if (dist > 0.85) continue; // clip to ellipse shape
          const brightness = Math.max(0, 1 - dist) * 0.7;
          ctx.fillStyle = `rgba(255, 255, ${200 + Math.random() * 55}, ${brightness})`;
          ctx.beginPath();
          ctx.arc(sx, sy, Math.random() * 1.2 + 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        ctx.restore();

        // Draw a small Earth in the corner
        const earthX = canvas.width * 0.85;
        const earthY = canvas.height * 0.72;
        const earthR = Math.min(canvas.width, canvas.height) * 0.09;

        // Earth glow
        const earthGlow = ctx.createRadialGradient(earthX, earthY, earthR * 0.9, earthX, earthY, earthR * 1.2);
        earthGlow.addColorStop(0, "rgba(56, 189, 248, 0.15)");
        earthGlow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = earthGlow;
        ctx.beginPath();
        ctx.arc(earthX, earthY, earthR * 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Earth sphere
        const earthGrad = ctx.createRadialGradient(earthX - earthR * 0.3, earthY - earthR * 0.3, earthR * 0.1, earthX, earthY, earthR);
        earthGrad.addColorStop(0, "#64b5f6");
        earthGrad.addColorStop(0.5, "#1e88e5");
        earthGrad.addColorStop(1, "#0d47a1");
        ctx.fillStyle = earthGrad;
        ctx.beginPath();
        ctx.arc(earthX, earthY, earthR, 0, Math.PI * 2);
        ctx.fill();

        // Continents
        ctx.save();
        ctx.beginPath();
        ctx.arc(earthX, earthY, earthR, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = "rgba(76, 175, 80, 0.45)";
        ctx.beginPath();
        ctx.ellipse(earthX - earthR * 0.2, earthY - earthR * 0.1, earthR * 0.35, earthR * 0.25, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(earthX + earthR * 0.3, earthY + earthR * 0.25, earthR * 0.2, earthR * 0.15, -0.2, 0, Math.PI * 2);
        ctx.fill();
        // Shadow
        const earthShadow = ctx.createLinearGradient(earthX - earthR * 0.5, earthY - earthR * 0.5, earthX + earthR * 0.5, earthY + earthR * 0.5);
        earthShadow.addColorStop(0, "rgba(0,0,0,0)");
        earthShadow.addColorStop(0.6, "rgba(0,0,0,0.4)");
        earthShadow.addColorStop(1, "rgba(0,0,0,0.85)");
        ctx.fillStyle = earthShadow;
        ctx.beginPath();
        ctx.arc(earthX, earthY, earthR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Shooting stars (spawn randomly)
        menu.shootingStars.forEach(ss => {
          if (!ss.active && Math.random() < 0.003) {
            ss.active = true;
            ss.x = Math.random() * canvas.width * 0.6;
            ss.y = Math.random() * canvas.height * 0.4;
            ss.vx = 6 + Math.random() * 4;
            ss.vy = 3 + Math.random() * 2;
            ss.maxLife = 40 + Math.random() * 30;
            ss.life = ss.maxLife;
          }
          if (ss.active) {
            ss.x += ss.vx;
            ss.y += ss.vy;
            ss.life--;
            if (ss.life <= 0) { ss.active = false; return; }
            const ssAlpha = ss.life / ss.maxLife;
            // Shooting star trail
            const trailGrad = ctx.createLinearGradient(ss.x, ss.y, ss.x - ss.vx * 6, ss.y - ss.vy * 6);
            trailGrad.addColorStop(0, `rgba(255, 255, 255, ${ssAlpha})`);
            trailGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
            ctx.strokeStyle = trailGrad;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(ss.x, ss.y);
            ctx.lineTo(ss.x - ss.vx * 6, ss.y - ss.vy * 6);
            ctx.stroke();
            // Head glow
            ctx.fillStyle = `rgba(255, 255, 255, ${ssAlpha})`;
            ctx.beginPath();
            ctx.arc(ss.x, ss.y, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        });

        // --- ANIMATED ROCKET flying across the menu ---
        const mr = menu.rocket;
        mr.time += dt;
        // Gentle sine wave flying path from left to right
        const rocketSpeed = 45;
        mr.x += rocketSpeed * dt;
        mr.y = canvas.height * 0.5 + Math.sin(mr.time * 1.2) * 60;
        mr.angle = Math.cos(mr.time * 1.2) * 0.08; // slight tilt as it oscillates

        // Wrap around when rocket goes off screen
        if (mr.x > canvas.width + 80) {
          mr.x = -80;
          mr.y = canvas.height * 0.35 + Math.random() * canvas.height * 0.3;
        }

        ctx.save();
        ctx.translate(mr.x, mr.y);
        ctx.rotate(mr.angle - Math.PI / 2 + Math.PI / 2); // slightly tilted right

        const mrW = 28;
        const mrH = 48;

        // Engine flame
        const flameLen = 12 + Math.sin(timestamp * 0.02) * 6;
        const flameGrad = ctx.createLinearGradient(0, mrH * 0.4, 0, mrH * 0.4 + flameLen);
        flameGrad.addColorStop(0, "rgba(255, 200, 50, 0.9)");
        flameGrad.addColorStop(0.5, "rgba(255, 100, 20, 0.6)");
        flameGrad.addColorStop(1, "rgba(255, 50, 0, 0)");
        ctx.fillStyle = flameGrad;
        ctx.beginPath();
        ctx.moveTo(-mrW * 0.2, mrH * 0.4);
        ctx.quadraticCurveTo(0, mrH * 0.4 + flameLen, mrW * 0.2, mrH * 0.4);
        ctx.fill();

        // Rocket body
        const bodyGrad = ctx.createLinearGradient(-mrW / 2, -mrH / 2, mrW / 2, -mrH / 2);
        bodyGrad.addColorStop(0, "#90a4ae");
        bodyGrad.addColorStop(0.5, "#eceff1");
        bodyGrad.addColorStop(1, "#78909c");
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.moveTo(0, -mrH / 2);
        ctx.quadraticCurveTo(mrW / 2, -mrH / 4, mrW / 2, mrH * 0.35);
        ctx.lineTo(-mrW / 2, mrH * 0.35);
        ctx.quadraticCurveTo(-mrW / 2, -mrH / 4, 0, -mrH / 2);
        ctx.closePath();
        ctx.fill();

        // Nose cone accent
        ctx.fillStyle = "#ff1744";
        ctx.beginPath();
        ctx.moveTo(0, -mrH / 2);
        ctx.quadraticCurveTo(mrW * 0.25, -mrH / 3.5, mrW * 0.15, -mrH / 6);
        ctx.lineTo(-mrW * 0.15, -mrH / 6);
        ctx.quadraticCurveTo(-mrW * 0.25, -mrH / 3.5, 0, -mrH / 2);
        ctx.closePath();
        ctx.fill();

        // Cockpit window
        ctx.fillStyle = "rgba(56, 189, 248, 0.7)";
        ctx.beginPath();
        ctx.arc(0, -mrH * 0.08, mrW * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        ctx.beginPath();
        ctx.ellipse(-mrW * 0.05, -mrH * 0.12, mrW * 0.08, mrW * 0.04, -0.5, 0, Math.PI * 2);
        ctx.fill();

        // Fins
        ctx.fillStyle = "#ff1744";
        ctx.beginPath();
        ctx.moveTo(-mrW / 2, mrH * 0.25);
        ctx.lineTo(-mrW / 2 - 6, mrH * 0.42);
        ctx.lineTo(-mrW / 2, mrH * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(mrW / 2, mrH * 0.25);
        ctx.lineTo(mrW / 2 + 6, mrH * 0.42);
        ctx.lineTo(mrW / 2, mrH * 0.35);
        ctx.closePath();
        ctx.fill();

        // Nav lights blinking
        const navOn = Math.floor(timestamp / 400) % 2 === 0;
        if (navOn) {
          ctx.fillStyle = "rgba(255, 23, 68, 0.8)";
          ctx.beginPath();
          ctx.arc(-mrW / 2 - 2, mrH * 0.3, 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(0, 230, 118, 0.8)";
          ctx.beginPath();
          ctx.arc(mrW / 2 + 2, mrH * 0.3, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();

        // Engine particle trail behind the rocket
        if (Math.random() < 0.6) {
          const trailX = mr.x + (Math.random() - 0.5) * 6;
          const trailY = mr.y + 28;
          ctx.fillStyle = `rgba(255, ${150 + Math.random() * 100}, 50, ${0.3 + Math.random() * 0.3})`;
          ctx.beginPath();
          ctx.arc(trailX, trailY + Math.random() * 10, Math.random() * 2.5 + 0.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Skip the rest of the game rendering in MENU state
        // Draw frame request for animation loop
        animationId = requestAnimationFrame(gameLoop);
        return;
      }
      // ============ END MENU BACKGROUND ============

      // Current active zone style
      const activeZoneIdx = getCurrentZoneIndex(state.gameTime);

      // Current active zone style (smooth color transition)
      const fractionalZone = Math.min(state.gameTime / 30, ZONES.length - 1);
      const currentZoneIdx = Math.floor(fractionalZone);
      const nextZoneIdx = Math.min(currentZoneIdx + 1, ZONES.length - 1);
      const zoneProgress = fractionalZone - currentZoneIdx;

      const zone = ZONES[currentZoneIdx];
      const nextZone = ZONES[nextZoneIdx];

      // Interpolate gradient start and end colors smoothly
      const currentStart = lerpColor(zone.gradientStart, nextZone.gradientStart, zoneProgress);
      const currentEnd = lerpColor(zone.gradientEnd, nextZone.gradientEnd, zoneProgress);

      // Draw Background Gradient (Sky to Space transition)
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, currentStart);
      grad.addColorStop(1, currentEnd);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // --- CINEMATIC LIGHT SUNLIGHT & SUNRAYS (Only in Earth & Atmosphere) ---
      if (activeZoneIdx <= 1) {
        ctx.save();
        // Soft white sun glow in top-middle
        const sunX = canvas.width / 2;
        const sunY = -30;
        const sunRadius = canvas.height * 0.35;
        const sunGlow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, sunRadius);
        const sunAlpha = activeZoneIdx === 0 ? 0.35 : 0.15; // fades as we reach atmosphere
        sunGlow.addColorStop(0, `rgba(255, 255, 255, ${sunAlpha})`);
        sunGlow.addColorStop(0.4, `rgba(255, 238, 88, ${sunAlpha * 0.4})`);
        sunGlow.addColorStop(1, "rgba(255, 255, 255, 0)");
        
        ctx.fillStyle = sunGlow;
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
        ctx.fill();

        // Draw soft vertical light shafts (sun rays)
        ctx.fillStyle = `rgba(255, 255, 255, ${sunAlpha * 0.08})`;
        ctx.beginPath();
        ctx.moveTo(sunX - 100, sunY);
        ctx.lineTo(sunX - 250, canvas.height);
        ctx.lineTo(sunX + 250, canvas.height);
        ctx.lineTo(sunX + 100, sunY);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(sunX, sunY);
        ctx.lineTo(sunX - 600, canvas.height);
        ctx.lineTo(sunX + 600, canvas.height);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // --- ATMOSPHERIC FOG (At horizon bottom) ---
        ctx.save();
        const fogGrad = ctx.createLinearGradient(0, canvas.height * 0.7, 0, canvas.height);
        const fogColor = activeZoneIdx === 0 ? "rgba(135, 206, 235, 0.4)" : "rgba(74, 144, 226, 0.2)";
        fogGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
        fogGrad.addColorStop(1, fogColor);
        ctx.fillStyle = fogGrad;
        ctx.fillRect(0, canvas.height * 0.7, canvas.width, canvas.height * 0.3);
        ctx.restore();
      }

      // Starfield Drawing (Always draw stars but adjust opacity and scrolling speed)
      const isSpace = activeZoneIdx >= 2;
      const isAtmo = activeZoneIdx === 1;
      
      state.stars.forEach((star) => {
        // Stars appear slowly in atmosphere and fully in space
        let starOpacity = star.opacity;
        if (isAtmo) {
          starOpacity *= 0.3; // faint stars
        } else if (!isSpace && !isAtmo) {
          starOpacity = 0; // invisible in Earth
        }

        // Apply time slow modifier to stars speed
        const currentSpeed = star.speed * (state.slowDuration > 0 ? 0.3 : 1.0);
        star.y += currentSpeed;
        if (star.y > canvas.height) {
          star.y = 0;
          star.x = Math.random() * canvas.width;
        }

        if (starOpacity > 0) {
          ctx.fillStyle = `rgba(255, 255, 255, ${starOpacity})`;
          ctx.fillRect(star.x, star.y, star.size, star.size);
        }
      });

      // Earth clouds scrolling (only in Earth and fading in Atmosphere)
      if (activeZoneIdx <= 1) {
        state.clouds.forEach((cloud) => {
          const currentSpeed = cloud.speed * (state.slowDuration > 0 ? 0.3 : 1.0);
          cloud.y += currentSpeed;
          if (cloud.y > canvas.height) {
            cloud.y = -cloud.height;
            cloud.x = Math.random() * canvas.width - 50;
          }

          // Fade out clouds in Atmosphere
          const opacity = activeZoneIdx === 0 ? 0.7 : 0.25;
          ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
          ctx.beginPath();
          ctx.arc(cloud.x, cloud.y, cloud.height, 0, Math.PI * 2);
          ctx.arc(cloud.x + cloud.width * 0.3, cloud.y - cloud.height * 0.3, cloud.height * 1.2, 0, Math.PI * 2);
          ctx.arc(cloud.x + cloud.width * 0.6, cloud.y, cloud.height * 0.9, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // Parallax approach planet (smooth transitions without teleportation)
      if (state.bgPlanetName !== "") {
        // Smoothly interpolate opacity towards target
        state.bgPlanetOpacity += (state.bgPlanetTargetOpacity - state.bgPlanetOpacity) * 0.05;
        
        // If we are fading out and are almost invisible, switch to next planet
        if (state.bgPlanetTargetOpacity === 0 && state.bgPlanetOpacity < 0.05) {
          if (state.nextBgPlanetName) {
            state.bgPlanetName = state.nextBgPlanetName;
            state.bgPlanetY = -150;
            state.bgPlanetScale = 0.1;
            // Set correct target scale based on name
            if (state.bgPlanetName === "MARS") state.bgPlanetTargetScale = 0.4;
            else if (state.bgPlanetName === "JUPITER") state.bgPlanetTargetScale = 0.55;
            else if (state.bgPlanetName === "SATURN") state.bgPlanetTargetScale = 0.55;
            else state.bgPlanetTargetScale = 0.45;
            
            state.bgPlanetOpacity = 0;
            state.bgPlanetTargetOpacity = 1.0;
            state.nextBgPlanetName = "";
          } else {
            state.bgPlanetName = "";
          }
        }

        // Scale and slide planet
        state.bgPlanetScale += (state.bgPlanetTargetScale - state.bgPlanetScale) * 0.005;
        state.bgPlanetY += 0.15; // slow scroll down

        // Auto fade out when moving too low
        if (state.bgPlanetY > canvas.height + 150 && state.bgPlanetTargetOpacity !== 0) {
          state.bgPlanetTargetOpacity = 0;
        }
      }

      if (state.bgPlanetName !== "") {
        ctx.save();
        ctx.globalAlpha = state.bgPlanetOpacity;
        ctx.shadowBlur = 30;
        
        const size = 180 * state.bgPlanetScale;
        const pX = canvas.width - size - 50;
        const pY = state.bgPlanetY;

        if (state.bgPlanetName === "WORLD") {
          ctx.shadowColor = "rgba(74, 144, 226, 0.5)";
          
          // Realistic atmospheric glow halo behind the planet
          const glow = ctx.createRadialGradient(pX, pY, size * 0.9, pX, pY, size * 1.15);
          glow.addColorStop(0, "rgba(74, 144, 226, 0.4)");
          glow.addColorStop(0.5, "rgba(74, 144, 226, 0.15)");
          glow.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(pX, pY, size * 1.15, 0, Math.PI * 2);
          ctx.fill();

          // Ocean base with spherical shade gradient
          const planetGrad = ctx.createRadialGradient(pX - size * 0.3, pY - size * 0.3, size * 0.1, pX, pY, size);
          planetGrad.addColorStop(0, "#4ba3e3"); // sunlit cyan-blue
          planetGrad.addColorStop(0.65, "#154360"); // deep ocean
          planetGrad.addColorStop(1, "#0a1f33"); // shadow terminator
          ctx.fillStyle = planetGrad;
          ctx.beginPath();
          ctx.arc(pX, pY, size, 0, Math.PI * 2);
          ctx.fill();

          // Green/brown continents clipped to Earth sphere
          ctx.save();
          ctx.beginPath();
          ctx.arc(pX, pY, size, 0, Math.PI * 2);
          ctx.clip();
          
          // Draw coastlines / continents
          ctx.fillStyle = "#e0cda9"; // sand color coastline
          // Continent 1: America
          ctx.beginPath();
          ctx.moveTo(pX - size * 0.65, pY - size * 0.75);
          ctx.quadraticCurveTo(pX - size * 0.15, pY - size * 0.5, pX - size * 0.25, pY - size * 0.05);
          ctx.lineTo(pX - size * 0.05, pY + size * 0.15);
          ctx.quadraticCurveTo(pX - size * 0.15, pY + size * 0.75, pX - size * 0.45, pY + size * 0.85);
          ctx.quadraticCurveTo(pX - size * 0.85, pY + size * 0.45, pX - size * 0.85, pY - size * 0.25);
          ctx.closePath();
          ctx.fill();

          // Continent 2: Africa/Europe
          ctx.beginPath();
          ctx.moveTo(pX + size * 0.05, pY - size * 0.65);
          ctx.quadraticCurveTo(pX + size * 0.55, pY - size * 0.75, pX + size * 0.85, pY - size * 0.25);
          ctx.quadraticCurveTo(pX + size * 0.65, pY + size * 0.15, pX + size * 0.55, pY + size * 0.45);
          ctx.quadraticCurveTo(pX + size * 0.15, pY + size * 0.85, pX - size * 0.15, pY + size * 0.65);
          ctx.quadraticCurveTo(pX + size * 0.05, pY + size * 0.05, pX + size * 0.05, pY - size * 0.65);
          ctx.closePath();
          ctx.fill();

          // Green forest/grass overlays (slightly smaller to reveal coastlines)
          const landGrad = ctx.createLinearGradient(pX - size, pY - size, pX + size, pY + size);
          landGrad.addColorStop(0, "#2e7d32");
          landGrad.addColorStop(0.7, "#558b2f");
          landGrad.addColorStop(1, "#6d4c41");
          ctx.fillStyle = landGrad;

          ctx.beginPath();
          ctx.moveTo(pX - size * 0.6, pY - size * 0.7);
          ctx.quadraticCurveTo(pX - size * 0.2, pY - size * 0.5, pX - size * 0.3, pY - size * 0.1);
          ctx.lineTo(pX - size * 0.1, pY + size * 0.1);
          ctx.quadraticCurveTo(pX - size * 0.2, pY + size * 0.7, pX - size * 0.4, pY + size * 0.8);
          ctx.quadraticCurveTo(pX - size * 0.8, pY + size * 0.4, pX - size * 0.8, pY - size * 0.2);
          ctx.closePath();
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(pX + size * 0.1, pY - size * 0.6);
          ctx.quadraticCurveTo(pX + size * 0.5, pY - size * 0.7, pX + size * 0.8, pY - size * 0.3);
          ctx.quadraticCurveTo(pX + size * 0.6, pY + size * 0.1, pX + size * 0.5, pY + size * 0.4);
          ctx.quadraticCurveTo(pX + size * 0.2, pY + size * 0.8, pX - size * 0.1, pY + size * 0.6);
          ctx.quadraticCurveTo(pX + size * 0.1, pY + size * 0.1, pX + size * 0.1, pY - size * 0.6);
          ctx.closePath();
          ctx.fill();

          // Swirling white clouds layers drifting
          const cloudRot = timestamp * 0.00015;
          ctx.save();
          ctx.translate(pX, pY);
          ctx.rotate(cloudRot);
          ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
          ctx.beginPath();
          ctx.ellipse(-size * 0.1, -size * 0.25, size * 0.7, size * 0.14, Math.PI / 8, 0, Math.PI * 2);
          ctx.ellipse(size * 0.2, size * 0.35, size * 0.65, size * 0.1, -Math.PI / 12, 0, Math.PI * 2);
          ctx.ellipse(-size * 0.3, size * 0.1, size * 0.5, size * 0.12, Math.PI / 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // 3D spherical shadow terminator overlay (light from top-left, shadow towards bottom-right)
          const shadowTerm = ctx.createLinearGradient(pX - size * 0.7, pY - size * 0.7, pX + size * 0.6, pY + size * 0.6);
          shadowTerm.addColorStop(0, "rgba(0,0,0,0)");
          shadowTerm.addColorStop(0.5, "rgba(0,0,0,0.22)");
          shadowTerm.addColorStop(0.85, "rgba(0,0,0,0.85)");
          shadowTerm.addColorStop(1, "rgba(0,0,0,0.96)");
          ctx.fillStyle = shadowTerm;
          ctx.beginPath();
          ctx.arc(pX, pY, size, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        } else if (state.bgPlanetName === "MARS") {
          ctx.shadowColor = "rgba(216, 67, 21, 0.5)";

          // Atmospheric glow
          const glow = ctx.createRadialGradient(pX, pY, size * 0.95, pX, pY, size * 1.12);
          glow.addColorStop(0, "rgba(255, 87, 34, 0.3)");
          glow.addColorStop(0.6, "rgba(255, 112, 67, 0.1)");
          glow.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(pX, pY, size * 1.12, 0, Math.PI * 2);
          ctx.fill();
          
          // Iron oxide red sphere
          const marsGrad = ctx.createRadialGradient(pX - size * 0.3, pY - size * 0.3, size * 0.1, pX, pY, size);
          marsGrad.addColorStop(0, "#ff7043");
          marsGrad.addColorStop(0.65, "#bf360c");
          marsGrad.addColorStop(1, "#3e2723");
          ctx.fillStyle = marsGrad;
          ctx.beginPath();
          ctx.arc(pX, pY, size, 0, Math.PI * 2);
          ctx.fill();

          // Mars surface details clipped
          ctx.save();
          ctx.beginPath();
          ctx.arc(pX, pY, size, 0, Math.PI * 2);
          ctx.clip();

          // Darker iron-oxide desert plains
          ctx.fillStyle = "rgba(78, 32, 16, 0.5)";
          ctx.beginPath();
          ctx.ellipse(pX - size * 0.25, pY + size * 0.1, size * 0.55, size * 0.2, Math.PI / 15, 0, Math.PI * 2);
          ctx.ellipse(pX + size * 0.3, pY - size * 0.25, size * 0.45, size * 0.14, -Math.PI / 8, 0, Math.PI * 2);
          ctx.ellipse(pX - size * 0.4, pY - size * 0.3, size * 0.3, size * 0.15, Math.PI / 4, 0, Math.PI * 2);
          ctx.fill();

          // Polar ice caps (textured white caps)
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(pX, pY - size * 0.96, size * 0.24, 0, Math.PI, false);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(pX + size * 0.05, pY + size * 0.99, size * 0.16, Math.PI, 0, false);
          ctx.fill();

          // Canyon cracks (Valles Marineris)
          ctx.strokeStyle = "rgba(54, 18, 9, 0.8)";
          ctx.lineWidth = size * 0.04;
          ctx.beginPath();
          ctx.moveTo(pX - size * 0.55, pY - size * 0.05);
          ctx.quadraticCurveTo(pX - size * 0.1, pY + size * 0.12, pX + size * 0.45, pY - size * 0.08);
          ctx.stroke();

          // 3D spherical shadow terminator overlay
          const shadowTerm = ctx.createLinearGradient(pX - size * 0.7, pY - size * 0.7, pX + size * 0.6, pY + size * 0.6);
          shadowTerm.addColorStop(0, "rgba(0,0,0,0)");
          shadowTerm.addColorStop(0.5, "rgba(0,0,0,0.22)");
          shadowTerm.addColorStop(0.85, "rgba(0,0,0,0.85)");
          shadowTerm.addColorStop(1, "rgba(0,0,0,0.96)");
          ctx.fillStyle = shadowTerm;
          ctx.beginPath();
          ctx.arc(pX, pY, size, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        } else if (state.bgPlanetName === "JUPITER") {
          ctx.shadowColor = "rgba(224, 130, 68, 0.4)";
          
          // Jupiter sphere base gradient
          const jupGrad = ctx.createRadialGradient(pX - size * 0.3, pY - size * 0.3, size * 0.1, pX, pY, size);
          jupGrad.addColorStop(0, "#ffe082"); // cream yellow
          jupGrad.addColorStop(0.65, "#d84315"); // orange-red
          jupGrad.addColorStop(1, "#3e2723"); // dark shadow
          ctx.fillStyle = jupGrad;
          ctx.beginPath();
          ctx.arc(pX, pY, size, 0, Math.PI * 2);
          ctx.fill();

          // Gas bands clipped to Jupiter sphere
          ctx.save();
          ctx.beginPath();
          ctx.arc(pX, pY, size, 0, Math.PI * 2);
          ctx.clip();

          // Dynamic Gas bands stripes with waves
          const bandColors = ["#8d6e63", "#d7ccc8", "#a1887f", "#ffcc80", "#ffe0b2", "#bcaaa4", "#8d6e63"];
          for (let i = 0; i < 11; i++) {
            ctx.fillStyle = bandColors[i % bandColors.length] + "95";
            const h = size * 0.2;
            const yOffset = pY - size + i * (size * 0.2) - h / 2;
            
            // Draw a wavy band instead of simple rectangle
            ctx.beginPath();
            ctx.moveTo(pX - size, yOffset);
            ctx.bezierCurveTo(pX - size * 0.5, yOffset - size * 0.05, pX, yOffset + size * 0.05, pX + size, yOffset);
            ctx.lineTo(pX + size, yOffset + h);
            ctx.bezierCurveTo(pX, yOffset + h + size * 0.05, pX - size * 0.5, yOffset + h - size * 0.05, pX - size, yOffset + h);
            ctx.closePath();
            ctx.fill();
          }

          // Swirling white storm ovals
          ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
          ctx.beginPath();
          ctx.ellipse(pX - size * 0.45, pY - size * 0.3, size * 0.08, size * 0.05, 0, 0, Math.PI * 2);
          ctx.ellipse(pX + size * 0.15, pY - size * 0.5, size * 0.12, size * 0.07, 0, 0, Math.PI * 2);
          ctx.ellipse(pX - size * 0.2, pY + size * 0.4, size * 0.09, size * 0.05, 0, 0, Math.PI * 2);
          ctx.fill();

          // Great Red Spot storm (nested orange-red swirling oval)
          ctx.fillStyle = "#b71c1c";
          ctx.beginPath();
          ctx.ellipse(pX + size * 0.35, pY + size * 0.22, size * 0.24, size * 0.14, 0, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.fillStyle = "#e64a19";
          ctx.beginPath();
          ctx.ellipse(pX + size * 0.35, pY + size * 0.22, size * 0.17, size * 0.09, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "#ff8a80";
          ctx.beginPath();
          ctx.ellipse(pX + size * 0.34, pY + size * 0.21, size * 0.09, size * 0.05, 0, 0, Math.PI * 2);
          ctx.fill();

          // 3D spherical shadow terminator overlay
          const shadowTerm = ctx.createLinearGradient(pX - size * 0.7, pY - size * 0.7, pX + size * 0.6, pY + size * 0.6);
          shadowTerm.addColorStop(0, "rgba(0,0,0,0)");
          shadowTerm.addColorStop(0.5, "rgba(0,0,0,0.22)");
          shadowTerm.addColorStop(0.85, "rgba(0,0,0,0.85)");
          shadowTerm.addColorStop(1, "rgba(0,0,0,0.96)");
          ctx.fillStyle = shadowTerm;
          ctx.beginPath();
          ctx.arc(pX, pY, size, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        } else if (state.bgPlanetName === "SATURN") {
          ctx.shadowColor = "rgba(240, 196, 120, 0.3)";
          
          // Saturn rings geometry
          const ringRadiusX = size * 1.75;
          const ringRadiusY = size * 0.38;
          const ringRotation = -Math.PI / 10;

          // 1. Draw BACK half of Saturn rings (top part) with concentric particle layers
          ctx.save();
          // Clip to draw only the back part (top of the rings)
          ctx.beginPath();
          ctx.rect(pX - ringRadiusX * 1.2, pY - ringRadiusX, ringRadiusX * 2.4, ringRadiusX);
          ctx.clip();

          // Cast shadow of planet body onto back rings
          const shadowGrad = ctx.createRadialGradient(pX, pY, size, pX + size * 0.3, pY + size * 0.3, size * 1.6);
          shadowGrad.addColorStop(0, "rgba(10, 15, 30, 0.9)");
          shadowGrad.addColorStop(0.6, "rgba(10, 15, 30, 0.8)");
          shadowGrad.addColorStop(1, "rgba(0,0,0,0)");

          // Draw multiple ring loops for particle density feeling
          const ringOpacity = [0.3, 0.5, 0.8, 0.05, 0.85, 0.6, 0.2];
          const ringWidths = [size * 0.08, size * 0.06, size * 0.12, size * 0.03, size * 0.16, size * 0.08, size * 0.05];
          const ringOffsets = [size * 0.6, size * 0.5, size * 0.38, size * 0.28, size * 0.12, size * 0.02, -size * 0.06];
          const ringColors = ["rgba(180, 160, 120, ", "rgba(215, 185, 130, ", "rgba(235, 210, 160, ", "rgba(0,0,0, ", "rgba(235, 210, 160, ", "rgba(215, 185, 130, ", "rgba(160, 140, 110, "];

          for (let i = 0; i < ringOffsets.length; i++) {
            ctx.strokeStyle = ringColors[i] + ringOpacity[i] + ")";
            ctx.lineWidth = ringWidths[i];
            ctx.beginPath();
            ctx.ellipse(pX, pY, ringRadiusX - ringOffsets[i], ringRadiusY - ringOffsets[i] * 0.22, ringRotation, 0, Math.PI * 2);
            ctx.stroke();
          }

          // Dark shadow overlay cast from body
          ctx.fillStyle = shadowGrad;
          ctx.beginPath();
          ctx.ellipse(pX + size * 0.2, pY + size * 0.1, size * 1.1, size * 0.7, ringRotation, -Math.PI / 2, Math.PI / 2);
          ctx.fill();

          ctx.restore();

          // 2. Draw Saturn Planet Body
          const satGrad = ctx.createRadialGradient(pX - size * 0.3, pY - size * 0.3, size * 0.1, pX, pY, size);
          satGrad.addColorStop(0, "#fce4ec"); // light cream
          satGrad.addColorStop(0.65, "#cfd8dc"); // beige-grey
          satGrad.addColorStop(1, "#263238"); // shadow
          ctx.fillStyle = satGrad;
          ctx.beginPath();
          ctx.arc(pX, pY, size, 0, Math.PI * 2);
          ctx.fill();

          // Saturn atmospheric bands
          ctx.save();
          ctx.beginPath();
          ctx.arc(pX, pY, size, 0, Math.PI * 2);
          ctx.clip();

          ctx.fillStyle = "rgba(188, 170, 164, 0.4)";
          ctx.fillRect(pX - size, pY - size * 0.4, size * 2, size * 0.15);
          ctx.fillRect(pX - size, pY - size * 0.1, size * 2, size * 0.2);
          ctx.fillRect(pX - size, pY + size * 0.3, size * 2, size * 0.1);

          // 3D spherical shadow terminator overlay
          const shadowTerm = ctx.createLinearGradient(pX - size * 0.7, pY - size * 0.7, pX + size * 0.6, pY + size * 0.6);
          shadowTerm.addColorStop(0, "rgba(0,0,0,0)");
          shadowTerm.addColorStop(0.5, "rgba(0,0,0,0.22)");
          shadowTerm.addColorStop(0.85, "rgba(0,0,0,0.85)");
          shadowTerm.addColorStop(1, "rgba(0,0,0,0.96)");
          ctx.fillStyle = shadowTerm;
          ctx.beginPath();
          ctx.arc(pX, pY, size, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();

          // 3. Draw FRONT half of Saturn rings (bottom part) concentric loops
          ctx.save();
          // Clip to draw only the front part (bottom of the rings)
          ctx.beginPath();
          ctx.rect(pX - ringRadiusX * 1.2, pY, ringRadiusX * 2.4, ringRadiusX);
          ctx.clip();

          for (let i = 0; i < ringOffsets.length; i++) {
            ctx.strokeStyle = ringColors[i] + ringOpacity[i] + ")";
            ctx.lineWidth = ringWidths[i];
            ctx.beginPath();
            ctx.ellipse(pX, pY, ringRadiusX - ringOffsets[i], ringRadiusY - ringOffsets[i] * 0.22, ringRotation, 0, Math.PI * 2);
            ctx.stroke();
          }

          ctx.restore();
        } else if (state.bgPlanetName === "URANUS") {
          ctx.shadowColor = "rgba(79, 195, 247, 0.35)";
          
          // Uranus base sphere (pale cyan-blue)
          const uranusGrad = ctx.createRadialGradient(pX - size * 0.3, pY - size * 0.3, size * 0.1, pX, pY, size);
          uranusGrad.addColorStop(0, "#e0f7fa");
          uranusGrad.addColorStop(0.7, "#4fc3f7");
          uranusGrad.addColorStop(1, "#0277bd");
          ctx.fillStyle = uranusGrad;
          ctx.beginPath();
          ctx.arc(pX, pY, size, 0, Math.PI * 2);
          ctx.fill();

          // Uranus details clipped
          ctx.save();
          ctx.beginPath();
          ctx.arc(pX, pY, size, 0, Math.PI * 2);
          ctx.clip();

          // Pale bands
          ctx.fillStyle = "rgba(255,255,255,0.12)";
          ctx.fillRect(pX - size, pY - size * 0.25, size * 2, size * 0.12);
          ctx.fillRect(pX - size, pY + size * 0.15, size * 2, size * 0.1);

          // 3D spherical shadow terminator overlay
          const shadowTerm = ctx.createLinearGradient(pX - size * 0.7, pY - size * 0.7, pX + size * 0.6, pY + size * 0.6);
          shadowTerm.addColorStop(0, "rgba(0,0,0,0)");
          shadowTerm.addColorStop(0.5, "rgba(0,0,0,0.22)");
          shadowTerm.addColorStop(0.85, "rgba(0,0,0,0.85)");
          shadowTerm.addColorStop(1, "rgba(0,0,0,0.96)");
          ctx.fillStyle = shadowTerm;
          ctx.beginPath();
          ctx.arc(pX, pY, size, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();

          // Uranus vertical thin rings (tilted on its side)
          ctx.save();
          ctx.translate(pX, pY);
          ctx.rotate(Math.PI * 0.42);
          
          ctx.strokeStyle = "rgba(224, 242, 241, 0.42)";
          ctx.lineWidth = size * 0.03;
          ctx.beginPath();
          ctx.ellipse(0, 0, size * 1.45, size * 0.15, 0, 0, Math.PI * 2);
          ctx.stroke();

          ctx.strokeStyle = "rgba(224, 242, 241, 0.22)";
          ctx.lineWidth = size * 0.015;
          ctx.beginPath();
          ctx.ellipse(0, 0, size * 1.55, size * 0.16, 0, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.restore();
        } else if (state.bgPlanetName === "NEPTUNE") {
          ctx.shadowColor = "rgba(21, 101, 192, 0.4)";
          
          // Neptune base sphere (deep royal blue)
          const nepGrad = ctx.createRadialGradient(pX - size * 0.3, pY - size * 0.3, size * 0.1, pX, pY, size);
          nepGrad.addColorStop(0, "#64b5f6");
          nepGrad.addColorStop(0.65, "#1565c0");
          nepGrad.addColorStop(1, "#0d47a1");
          ctx.fillStyle = nepGrad;
          ctx.beginPath();
          ctx.arc(pX, pY, size, 0, Math.PI * 2);
          ctx.fill();

          // Great Dark Spot and methane clouds
          ctx.save();
          ctx.beginPath();
          ctx.arc(pX, pY, size, 0, Math.PI * 2);
          ctx.clip();

          // Great Dark Spot (oval storm)
          ctx.fillStyle = "#0c2c5c";
          ctx.beginPath();
          ctx.ellipse(pX + size * 0.25, pY + size * 0.15, size * 0.3, size * 0.18, Math.PI / 12, 0, Math.PI * 2);
          ctx.fill();

          // White methane bands
          ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
          ctx.lineWidth = size * 0.03;
          ctx.beginPath();
          ctx.arc(pX - size * 0.3, pY - size * 0.2, size * 0.9, -Math.PI / 4, Math.PI / 4);
          ctx.stroke();
          
          ctx.beginPath();
          ctx.arc(pX + size * 0.2, pY + size * 0.3, size * 0.8, Math.PI * 0.75, Math.PI * 1.25);
          ctx.stroke();

          // 3D spherical shadow terminator overlay
          const shadowTerm = ctx.createLinearGradient(pX - size * 0.7, pY - size * 0.7, pX + size * 0.6, pY + size * 0.6);
          shadowTerm.addColorStop(0, "rgba(0,0,0,0)");
          shadowTerm.addColorStop(0.5, "rgba(0,0,0,0.22)");
          shadowTerm.addColorStop(0.85, "rgba(0,0,0,0.85)");
          shadowTerm.addColorStop(1, "rgba(0,0,0,0.96)");
          ctx.fillStyle = shadowTerm;
          ctx.beginPath();
          ctx.arc(pX, pY, size, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        } else if (state.bgPlanetName === "MOON") {
          ctx.shadowColor = "rgba(144, 164, 174, 0.4)";
          
          // Subtle lunar glow halo
          const glow = ctx.createRadialGradient(pX, pY, size * 0.95, pX, pY, size * 1.08);
          glow.addColorStop(0, "rgba(207, 216, 220, 0.2)");
          glow.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(pX, pY, size * 1.08, 0, Math.PI * 2);
          ctx.fill();

          // Lunar grey radial base
          const moonGrad = ctx.createRadialGradient(pX - size * 0.3, pY - size * 0.3, size * 0.1, pX, pY, size);
          moonGrad.addColorStop(0, "#eceff1");
          moonGrad.addColorStop(0.7, "#b0bec5");
          moonGrad.addColorStop(1, "#37474f");
          ctx.fillStyle = moonGrad;
          ctx.beginPath();
          ctx.arc(pX, pY, size, 0, Math.PI * 2);
          ctx.fill();

          // Craters details clipped to Moon sphere
          ctx.save();
          ctx.beginPath();
          ctx.arc(pX, pY, size, 0, Math.PI * 2);
          ctx.clip();

          // Darker lunar maria (plains)
          ctx.fillStyle = "rgba(78, 90, 101, 0.3)";
          ctx.beginPath();
          ctx.ellipse(pX - size * 0.3, pY + size * 0.15, size * 0.4, size * 0.25, Math.PI / 10, 0, Math.PI * 2);
          ctx.ellipse(pX + size * 0.4, pY - size * 0.3, size * 0.3, size * 0.2, -Math.PI / 4, 0, Math.PI * 2);
          ctx.ellipse(pX + size * 0.1, pY + size * 0.4, size * 0.35, size * 0.18, Math.PI / 6, 0, Math.PI * 2);
          ctx.fill();

          // Individual crater circles with light rims and dark shadows inside
          const craters = [
            { cX: pX - size * 0.4, cY: pY - size * 0.3, r: size * 0.12 },
            { cX: pX + size * 0.2, cY: pY + size * 0.2, r: size * 0.16 },
            { cX: pX - size * 0.1, cY: pY - size * 0.45, r: size * 0.08 },
            { cX: pX + size * 0.5, cY: pY + size * 0.3, r: size * 0.07 },
            { cX: pX - size * 0.2, cY: pY + size * 0.5, r: size * 0.1 },
            { cX: pX + size * 0.3, cY: pY - size * 0.4, r: size * 0.09 },
          ];

          craters.forEach(c => {
            // Dark crater shadow inside
            ctx.fillStyle = "rgba(38, 50, 56, 0.45)";
            ctx.beginPath();
            ctx.arc(c.cX, c.cY, c.r, 0, Math.PI * 2);
            ctx.fill();

            // Light rim highlight
            ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
            ctx.lineWidth = size * 0.015;
            ctx.beginPath();
            ctx.arc(c.cX - size * 0.02, c.cY - size * 0.02, c.r, 0, Math.PI * 2);
            ctx.stroke();
          });

          // 3D spherical shadow terminator overlay
          const shadowTerm = ctx.createLinearGradient(pX - size * 0.7, pY - size * 0.7, pX + size * 0.6, pY + size * 0.6);
          shadowTerm.addColorStop(0, "rgba(0,0,0,0)");
          shadowTerm.addColorStop(0.5, "rgba(0,0,0,0.22)");
          shadowTerm.addColorStop(0.85, "rgba(0,0,0,0.85)");
          shadowTerm.addColorStop(1, "rgba(0,0,0,0.96)");
          ctx.fillStyle = shadowTerm;
          ctx.beginPath();
          ctx.arc(pX, pY, size, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        } else if (state.bgPlanetName === "NEBULA") {
          state.nebulaAngle += 0.003;
          
          // Outer gas dust clouds
          const nebGrad1 = ctx.createRadialGradient(pX, pY, size * 0.2, pX, pY, size * 2);
          nebGrad1.addColorStop(0, "rgba(186, 104, 200, 0.4)"); // magenta/purple
          nebGrad1.addColorStop(0.5, "rgba(77, 208, 225, 0.2)"); // cyan
          nebGrad1.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = nebGrad1;
          ctx.beginPath();
          ctx.arc(pX, pY, size * 2, 0, Math.PI * 2);
          ctx.fill();

          // Inner hot gas core
          const coreGrad = ctx.createRadialGradient(pX - size * 0.3, pY + size * 0.2, 5, pX - size * 0.2, pY + size * 0.2, size * 0.8);
          coreGrad.addColorStop(0, "rgba(244, 143, 177, 0.6)"); // hot pink core
          coreGrad.addColorStop(0.6, "rgba(103, 58, 183, 0.25)"); // purple halo
          coreGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = coreGrad;
          ctx.beginPath();
          ctx.arc(pX - size * 0.2, pY + size * 0.2, size * 0.8, 0, Math.PI * 2);
          ctx.fill();

          // Sparkle stars inside the nebula
          ctx.fillStyle = "#ffffff";
          for (let i = 0; i < 6; i++) {
            const starX = pX + Math.sin(state.nebulaAngle + i) * size * 0.8;
            const starY = pY + Math.cos(state.nebulaAngle * 1.5 + i * 2) * size * 0.8;
            const starSize = (Math.sin(timestamp * 0.005 + i) + 1.5) * 1.8;
            ctx.beginPath();
            ctx.arc(starX, starY, starSize, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        ctx.restore();
      }

      // Applying Screen Shake
      ctx.save();
      if (state.screenShake > 0) {
        const shakeX = (Math.random() - 0.5) * state.screenShake;
        const shakeY = (Math.random() - 0.5) * state.screenShake;
        ctx.translate(shakeX, shakeY);
        state.screenShake *= 0.9; // decay
        if (state.screenShake < 0.1) state.screenShake = 0;
      }

      // Draw Engine Particles (Rocket trails - dynamic colors based on zone)
      if (state.gameState === "PLAYING") {
        const engineFireCount = Math.floor(Math.random() * 2) + 2;
        const slowMult = state.slowDuration > 0 ? 0.3 : 1.0;
        const activeZoneIdx = getCurrentZoneIndex(state.gameTime);
        
        for (let i = 0; i < engineFireCount; i++) {
          // Spawn engine trail particles
          const p = state.particles.find(p => !p.active);
          if (p) {
            p.active = true;
            p.x = state.rocketX + state.rocketWidth / 2 + (Math.random() * 8 - 4);
            p.y = state.rocketY + state.rocketHeight - 5;
            p.vx = (Math.random() - 0.5) * 1.5;
            p.vy = (Math.random() * 5 + 3) * slowMult;
            p.size = Math.random() * 5 + 3;
            
            // Dynamic particle colors matching engine types
            let trailColor = "#ff9800";
            if (state.doublePointsDuration > 0) {
              trailColor = "#ba68c8"; // double points trail
            } else if (activeZoneIdx >= 4) {
              trailColor = Math.random() > 0.45 ? "#d500f9" : "#ff1744"; // plasma pink/magenta
            } else if (activeZoneIdx >= 2) {
              trailColor = Math.random() > 0.45 ? "#00e5ff" : "#e0f7fa"; // ion cyan/blue
            } else {
              trailColor = Math.random() > 0.4 ? "#ff9800" : "#ff3d00"; // chemical yellow/orange
            }
            
            p.color = trailColor;
            p.alpha = 1;
            p.maxLife = Math.random() * 15 + 10;
            p.life = p.maxLife;
          }
        }
      }

      // Draw and Update Particles Pool
      state.particles.forEach((p) => {
        if (!p.active) return;
        
        p.life -= 1;
        if (p.life <= 0) {
          p.active = false;
          return;
        }

        p.x += p.vx;
        p.y += p.vy;
        p.alpha = p.life / p.maxLife;

        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1.0; // restore global alpha

      // --- GAMEPLAY LOGIC ---
      if (state.gameState === "PLAYING") {
        state.gameTime += dt;
        
        // Check for Zone changes every 30 seconds
        const newZoneIdx = getCurrentZoneIndex(state.gameTime);
        if (newZoneIdx !== state.activeZoneIndex) {
          state.activeZoneIndex = newZoneIdx;
          setActiveZoneIndex(newZoneIdx);
          triggerZoneTransition(newZoneIdx);

          // Separation event when entering Atmosphere zone
          if (newZoneIdx === 1 && state.selectedRocket === "classic" && !state.boostersDetached) {
            state.boostersDetached = true;
            const rx = state.rocketX;
            const ry = state.rocketY;
            const rw = state.rocketWidth;
            const rh = state.rocketHeight;

            state.detachedParts = [
              {
                type: "srb_left",
                x: rx - rw * 0.1,
                y: ry + rh * 0.3,
                vx: -1.5,
                vy: 2.0,
                angle: 0,
                rotSpeed: -0.015,
                width: rw * 0.16,
                height: rh * 0.8,
                active: true
              },
              {
                type: "srb_right",
                x: rx + rw * 0.94,
                y: ry + rh * 0.3,
                vx: 1.5,
                vy: 2.0,
                angle: 0,
                rotSpeed: 0.015,
                width: rw * 0.16,
                height: rh * 0.8,
                active: true
              },
              {
                type: "tank",
                x: rx + rw * 0.3,
                y: ry + rh * 0.05,
                vx: 0,
                vy: 1.0,
                angle: 0,
                rotSpeed: 0.005,
                width: rw * 0.4,
                height: rh * 0.9,
                active: true
              }
            ];
            // Play separation clank sound
            soundManagerRef.current.playExplosion();

            // Spawn only small, cold white steam particles at the joint connectors (representing pneumatic separation bolts / thrusters)
            for (let i = 0; i < 12; i++) {
              const p = state.particles.find(part => !part.active);
              if (p) {
                p.active = true;
                const sideLeft = Math.random() > 0.5;
                p.x = sideLeft ? rx : rx + rw;
                p.y = ry + rh * 0.4 + (Math.random() * 20 - 10);
                p.vx = sideLeft ? -(Math.random() * 3 + 2) : (Math.random() * 3 + 2); // puff outwards
                p.vy = (Math.random() - 0.5) * 2;
                p.size = Math.random() * 4 + 2;
                p.color = "rgba(240, 240, 240, 0.8)"; // white steam
                p.alpha = 0.8;
                p.maxLife = Math.random() * 15 + 10;
                p.life = p.maxLife;
              }
            }
          }
        }

        // Score increments: 1 point per second. Double score if double points active
        const scoreIncrement = dt * (state.doublePointsDuration > 0 ? 2 : 1);
        const oldScore = Math.floor(state.score);
        state.score += scoreIncrement;
        const newScore = Math.floor(state.score);

        if (newScore > oldScore) {
          setScore(newScore);
          
          // Save high score immediately
          if (newScore > state.highScore) {
            state.highScore = newScore;
            setHighScore(newScore);
            localStorage.setItem("space_dodge_high_score", newScore.toString());
          }
        }

        // Difficulty Multiplier increases speed and spawns over time
        state.difficultyMultiplier = 1.0 + (state.gameTime / 15) * 0.15; // +15% difficulty every 15s

        // Spawning Timers (influenced by Time Slow and Difficulty)
        const gameSlowMult = state.slowDuration > 0 ? 0.4 : 1.0;
        const spawnDelay = Math.max(0.4, (1.8 - (state.gameTime / 30) * 0.3)) / gameSlowMult; // spawn faster as time goes on
        
        state.obstacleSpawnTimer += dt;
        if (state.obstacleSpawnTimer >= spawnDelay) {
          state.obstacleSpawnTimer = 0;
          spawnObstacle(canvas.width);
        }

        // Power-ups spawn timer (spawn more frequently: every 9 seconds)
        state.powerupSpawnTimer += dt;
        if (state.powerupSpawnTimer >= 9.0) {
          state.powerupSpawnTimer = 0;
          spawnPowerUp(canvas.width);
        }

        // Update Powerups Cooldown
        if (state.shieldDuration > 0) {
          state.shieldDuration -= dt * 1000;
          setShieldTimeLeft(Math.max(0, Math.ceil(state.shieldDuration / 1000)));
        }
        if (state.slowDuration > 0) {
          state.slowDuration -= dt * 1000;
          setSlowTimeLeft(Math.max(0, Math.ceil(state.slowDuration / 1000)));
          if (state.slowDuration <= 0) {
            soundManagerRef.current.setMusicPitchFactor(1.0);
          }
        }
        if (state.doublePointsDuration > 0) {
          state.doublePointsDuration -= dt * 1000;
          setDoublePointsTimeLeft(Math.max(0, Math.ceil(state.doublePointsDuration / 1000)));
        }

        // --- PLAYER CONTROLS (Movement damping) ---
        // Keyboard fallback
        let targetDiff = 0;
        if (state.keys["ArrowLeft"] || state.keys["a"] || state.keys["A"]) {
          targetDiff = -12;
        } else if (state.keys["ArrowRight"] || state.keys["d"] || state.keys["D"]) {
          targetDiff = 12;
        }
        state.targetRocketX += targetDiff;

        // Smooth Lerp Rocket Position to Target Touch/Key position
        state.rocketX += (state.targetRocketX - state.rocketX) * 0.15;

        // Clamp to screen boundaries
        if (state.rocketX < 0) {
          state.rocketX = 0;
          state.targetRocketX = 0;
        }
        const maxRocketX = canvas.width - state.rocketWidth;
        if (state.rocketX > maxRocketX) {
          state.rocketX = maxRocketX;
          state.targetRocketX = maxRocketX;
        }
      }

      // --- UPDATE & DRAW DETACHED PARTS (SRBs & Orange Tank) ---
      state.detachedParts.forEach((part) => {
        if (!part.active) return;

        // Physics update
        if (state.gameState === "PLAYING") {
          part.x += part.vx;
          // Apply atmospheric drag (slight deceleration in horizontal drift)
          part.vx *= 0.98;
          part.y += part.vy;
          // Gravity acceleration pulling it down
          part.vy += 0.08;
          part.angle += part.rotSpeed;
          
          if (part.y > canvas.height + 150) {
            part.active = false;
            return;
          }
        }

        // Draw detached part with entry burn friction glow!
        ctx.save();
        ctx.translate(part.x + part.width / 2, part.y + part.height / 2);
        ctx.rotate(part.angle);

        // Entry Friction Glow around the part (radial orange/yellow burn)
        ctx.shadowBlur = 20;
        ctx.shadowColor = "#ff5722";

        const px = -part.width / 2;
        const py = -part.height / 2;
        const pw = part.width;
        const ph = part.height;

        if (part.type === "tank") {
          // Orange tank
          const tankGrad = ctx.createLinearGradient(px, py, px + pw, py);
          tankGrad.addColorStop(0, "#d84315"); // rust dark
          tankGrad.addColorStop(0.4, "#ff7043"); // light orange
          tankGrad.addColorStop(0.7, "#ff8a65"); // highlight
          tankGrad.addColorStop(1, "#c62828"); // shadow red
          ctx.fillStyle = tankGrad;
          
          ctx.beginPath();
          // Rounded capsule shape
          if (ctx.roundRect) {
            ctx.roundRect(px, py, pw, ph, 8);
          } else {
            ctx.rect(px, py, pw, ph);
          }
          ctx.fill();

          // Cap dome tip
          ctx.fillStyle = "#ff5722";
          ctx.beginPath();
          ctx.moveTo(px, py + 8);
          ctx.quadraticCurveTo(0, py - ph * 0.15, px + pw, py + 8);
          ctx.closePath();
          ctx.fill();
        } else {
          // SRB (left or right booster)
          const srbGrad = ctx.createLinearGradient(px, py, px + pw, py);
          srbGrad.addColorStop(0, "#78909c");
          srbGrad.addColorStop(0.4, "#cfd8dc");
          srbGrad.addColorStop(1, "#455a64");
          ctx.fillStyle = srbGrad;

          ctx.beginPath();
          ctx.fillRect(px, py, pw, ph);

          // Nose cap (dark conical top)
          ctx.fillStyle = "#37474f";
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(0, py - 12);
          ctx.lineTo(px + pw, py);
          ctx.closePath();
          ctx.fill();

          // Engine nozzle bottom
          ctx.fillStyle = "#212121";
          ctx.fillRect(px - 1, py + ph, pw + 2, 4);
        }

        // Friction entry burn visual: draw small fire shield at the leading edge (bottom/sides)
        const burnGrad = ctx.createRadialGradient(0, ph * 0.25, 0, 0, ph * 0.25, pw * 1.5);
        burnGrad.addColorStop(0, "rgba(255, 255, 255, 0.8)");
        burnGrad.addColorStop(0.3, "rgba(255, 235, 59, 0.9)");
        burnGrad.addColorStop(0.6, "rgba(255, 87, 34, 0.75)");
        burnGrad.addColorStop(1, "rgba(244, 67, 54, 0)");
        ctx.fillStyle = burnGrad;
        
        ctx.beginPath();
        ctx.arc(0, ph * 0.2, pw * 1.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Spawn entry fire spark particles behind it
        if (state.gameState === "PLAYING" && Math.random() < 0.22) {
          const p = state.particles.find(p => !p.active);
          if (p) {
            p.active = true;
            p.x = part.x + part.width / 2 + (Math.random() * part.width - part.width / 2);
            p.y = part.y;
            p.vx = (Math.random() - 0.5) * 4;
            p.vy = -(Math.random() * 5 + 3); // sparks drift upwards relative to falling booster
            p.size = Math.random() * 3 + 1.2;
            p.color = Math.random() > 0.45 ? "#ffeb3b" : "#ff5722";
            p.alpha = 1;
            p.maxLife = Math.random() * 20 + 15;
            p.life = p.maxLife;
          }
        }
      });

      // --- DRAW PLAYER ROCKET ---
      ctx.save();
      
      // Engine vibration tremble animation (adds raw physical engine power feeling)
      let shakeOffsetX = 0;
      let shakeOffsetY = 0;
      if (state.gameState === "PLAYING") {
        shakeOffsetX = (Math.random() - 0.5) * 1.5;
        shakeOffsetY = (Math.random() - 0.5) * 1.5;
      }
      
      const rx = state.rocketX + shakeOffsetX;
      const ry = state.rocketY + shakeOffsetY;
      const rw = state.rocketWidth;
      const rh = state.rocketHeight;
      const cx = rx + rw / 2;

      // Rocket skin parameters
      let bColStart = "#90a4ae", bColMid1 = "#cfd8dc", bColMid2 = "#eceff1", bColEnd = "#78909c"; // classic
      let nColStart = "#d84315", nColMid = "#ff5722", nColEnd = "#b71c1c";
      let wColStart = "#546e7a", wColEnd = "#37474f";
      let glowColor = state.doublePointsDuration > 0 ? "#ffd700" : "#ff3333";
      let flameColor1 = "#ff5722", flameColor2 = "#ffeb3b";

      if (state.selectedRocket === "cyber") {
        bColStart = "#006064"; bColMid1 = "#00bcd4"; bColMid2 = "#80deea"; bColEnd = "#00838f";
        nColStart = "#4a148c"; nColMid = "#9c27b0"; nColEnd = "#6a1b9a";
        wColStart = "#5e35b1"; wColEnd = "#311b92";
        glowColor = state.doublePointsDuration > 0 ? "#ffd700" : "#e040fb";
        flameColor1 = "#e040fb"; flameColor2 = "#00e5ff";
      } else if (state.selectedRocket === "mars") {
        bColStart = "#5d0c00"; bColMid1 = "#d84315"; bColMid2 = "#ff7043"; bColEnd = "#3e2723";
        nColStart = "#212121"; nColMid = "#424242"; nColEnd = "#111111";
        wColStart = "#3e2723"; wColEnd = "#271206";
        glowColor = state.doublePointsDuration > 0 ? "#ffd700" : "#ff5722";
        flameColor1 = "#ff5722"; flameColor2 = "#ffb74d";
      } else if (state.selectedRocket === "gold") {
        bColStart = "#b0bec5"; bColMid1 = "#ffffff"; bColMid2 = "#f5f5f5"; bColEnd = "#90a4ae";
        nColStart = "#ff8f00"; nColMid = "#ffd54f"; nColEnd = "#ffc107";
        wColStart = "#ffa000"; wColEnd = "#ff8f00";
        glowColor = state.doublePointsDuration > 0 ? "#ffd700" : "#ffd54f";
        flameColor1 = "#ffd54f"; flameColor2 = "#ffffff";
      } else if (state.selectedRocket === "void") {
        bColStart = "#111111"; bColMid1 = "#263238"; bColMid2 = "#37474f"; bColEnd = "#1a252c";
        nColStart = "#b71c1c"; nColMid = "#ff1744"; nColEnd = "#800000";
        wColStart = "#1c2833"; wColEnd = "#111111";
        glowColor = state.doublePointsDuration > 0 ? "#ffd700" : "#00e5ff";
        flameColor1 = "#00e5ff"; flameColor2 = "#ff1744";
      }

      // Rocket Glow
      ctx.shadowBlur = 15;
      ctx.shadowColor = glowColor;

      // Gradients setup
      const bodyGrad = ctx.createLinearGradient(rx, ry, rx + rw, ry);
      bodyGrad.addColorStop(0, bColStart);
      bodyGrad.addColorStop(0.35, bColMid1);
      bodyGrad.addColorStop(0.65, bColMid2);
      bodyGrad.addColorStop(1, bColEnd);

      const noseGrad = ctx.createLinearGradient(rx + rw * 0.3, ry, rx + rw * 0.7, ry);
      noseGrad.addColorStop(0, nColStart);
      noseGrad.addColorStop(0.5, nColMid);
      noseGrad.addColorStop(1, nColEnd);

      const leftWingGrad = ctx.createLinearGradient(rx - rw * 0.15, ry, rx + rw * 0.25, ry);
      leftWingGrad.addColorStop(0, wColStart);
      leftWingGrad.addColorStop(1, wColEnd);

      const rightWingGrad = ctx.createLinearGradient(rx + rw * 0.75, ry, rx + rw * 1.18, ry);
      rightWingGrad.addColorStop(0, wColEnd);
      rightWingGrad.addColorStop(1, wColStart);

      // Unique Cabin positions and sizes
      let cyPos = ry + rh * 0.35;
      let cRadius = rw * 0.23; // significantly larger window

      if (state.selectedRocket === "cyber") {
        cyPos = ry + rh * 0.36;
        cRadius = rw * 0.22;

        // Cyber delta jet wings (forward-swept delta with carbon fiber weave & titanium trim)
        ctx.fillStyle = leftWingGrad;
        ctx.beginPath();
        ctx.moveTo(rx + rw * 0.22, ry + rh * 0.45);
        ctx.lineTo(rx - rw * 0.35, ry + rh * 0.3); // swept forward wings!
        ctx.lineTo(rx - rw * 0.1, ry + rh * 0.85);
        ctx.lineTo(rx + rw * 0.25, ry + rh * 0.75);
        ctx.fill();

        ctx.fillStyle = rightWingGrad;
        ctx.beginPath();
        ctx.moveTo(rx + rw * 0.78, ry + rh * 0.45);
        ctx.lineTo(rx + rw * 1.35, ry + rh * 0.3);
        ctx.lineTo(rx + rw * 1.1, ry + rh * 0.85);
        ctx.lineTo(rx + rw * 0.75, ry + rh * 0.75);
        ctx.fill();

        // Carbon weave overlay on wings
        ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
        ctx.lineWidth = 1;
        for (let i = -10; i < rw * 0.5; i += 4) {
          ctx.beginPath();
          ctx.moveTo(rx + i, ry + rh * 0.3);
          ctx.lineTo(rx + i - rw * 0.15, ry + rh * 0.8);
          ctx.stroke();
        }

        // Polygonal body (Stealth-like aerodynamic panels)
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.moveTo(cx, ry); // sharp nose
        ctx.lineTo(rx + rw * 0.8, ry + rh * 0.35);
        ctx.lineTo(rx + rw * 0.75, ry + rh * 0.82);
        ctx.lineTo(cx, ry + rh * 0.9); // back indent
        ctx.lineTo(rx + rw * 0.25, ry + rh * 0.82);
        ctx.lineTo(rx + rw * 0.2, ry + rh * 0.35);
        ctx.closePath();
        ctx.fill();

        // Panel cuts & fine lines
        ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(cx, ry + rh * 0.15);
        ctx.lineTo(cx, ry + rh * 0.6);
        ctx.moveTo(rx + rw * 0.3, ry + rh * 0.45);
        ctx.lineTo(rx + rw * 0.7, ry + rh * 0.45);
        ctx.stroke();

        // Glowing Purple detail plate lines
        ctx.strokeStyle = "#e040fb";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(rx + rw * 0.32, ry + rh * 0.4);
        ctx.lineTo(rx + rw * 0.32, ry + rh * 0.78);
        ctx.moveTo(rx + rw * 0.68, ry + rh * 0.4);
        ctx.lineTo(rx + rw * 0.68, ry + rh * 0.78);
        ctx.stroke();

        // Cabin window hexagonal outline
        drawPilotFace(ctx, cx, cyPos, cRadius, state.selectedPilot);

        ctx.strokeStyle = "#00e5ff";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
          ctx.lineTo(cx + Math.cos(angle) * cRadius, cyPos + Math.sin(angle) * cRadius);
        }
        ctx.closePath();
        ctx.stroke();

        // Titanium thruster bell discoloration near exhaust lip
        const bellGrad = ctx.createLinearGradient(cx - rw * 0.18, ry + rh * 0.81, cx + rw * 0.18, ry + rh * 0.85);
        bellGrad.addColorStop(0, "#37474f");
        bellGrad.addColorStop(0.3, "#3f51b5"); // heat indigo
        bellGrad.addColorStop(0.65, "#ab47bc"); // heat purple
        bellGrad.addColorStop(1, "#212121");
        ctx.fillStyle = bellGrad;
        ctx.fillRect(cx - rw * 0.15, ry + rh * 0.82, rw * 0.3, rh * 0.035);

      } else if (state.selectedRocket === "mars") {
        cyPos = ry + rh * 0.38;
        cRadius = rw * 0.24; // larger glass for mars rover capsule

        // Solar Array Panel appendages with textured golden grids and support trusses
        ctx.fillStyle = "#ffb74d"; // solar gold base
        ctx.strokeStyle = "#271206";
        ctx.lineWidth = 1.8;
        // Left panel
        ctx.fillRect(rx - rw * 0.38, ry + rh * 0.35, rw * 0.43, rh * 0.18);
        ctx.strokeRect(rx - rw * 0.38, ry + rh * 0.35, rw * 0.43, rh * 0.18);
        // Right panel
        ctx.fillRect(rx + rw * 0.95, ry + rh * 0.35, rw * 0.43, rh * 0.18);
        ctx.strokeRect(rx + rw * 0.95, ry + rh * 0.35, rw * 0.43, rh * 0.18);
        
        // Detailed panel matrix lines (grid layout)
        ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        // grids Left
        for (let offset = -0.3; offset < 0.05; offset += 0.1) {
          ctx.moveTo(rx + rw * offset, ry + rh * 0.35);
          ctx.lineTo(rx + rw * offset, ry + rh * 0.53);
        }
        ctx.moveTo(rx - rw * 0.38, ry + rh * 0.44); ctx.lineTo(rx + rw * 0.05, ry + rh * 0.44);
        // grids Right
        for (let offset = 1.05; offset < 1.4; offset += 0.1) {
          ctx.moveTo(rx + rw * offset, ry + rh * 0.35);
          ctx.lineTo(rx + rw * offset, ry + rh * 0.53);
        }
        ctx.moveTo(rx + rw * 0.95, ry + rh * 0.44); ctx.lineTo(rx + rw * 1.38, ry + rh * 0.44);
        ctx.stroke();

        // Support trusses connecting solar panels
        ctx.strokeStyle = "#37474f";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(rx - rw * 0.05, ry + rh * 0.44); ctx.lineTo(rx + rw * 0.15, ry + rh * 0.44);
        ctx.moveTo(rx + rw * 0.85, ry + rh * 0.44); ctx.lineTo(rx + rw * 1.05, ry + rh * 0.44);
        ctx.stroke();

        // Rugged industrial capsule body split into panels
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(rx + rw * 0.1, ry + rh * 0.15, rw * 0.8, rh * 0.7, 12);
        } else {
          ctx.rect(rx + rw * 0.1, ry + rh * 0.15, rw * 0.8, rh * 0.7);
        }
        ctx.fill();

        // Rusty weathering scratches & dust staining (simulating Martian service)
        ctx.strokeStyle = "rgba(141, 110, 99, 0.45)"; // rust brown lines
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(rx + rw * 0.15, ry + rh * 0.3); ctx.lineTo(rx + rw * 0.3, ry + rh * 0.36);
        ctx.moveTo(rx + rw * 0.7, ry + rh * 0.6); ctx.lineTo(rx + rw * 0.82, ry + rh * 0.68);
        ctx.moveTo(rx + rw * 0.2, ry + rh * 0.72); ctx.lineTo(rx + rw * 0.32, ry + rh * 0.78);
        ctx.stroke();

        // Fine horizontal and vertical structural panel lines
        ctx.strokeStyle = "rgba(0, 0, 0, 0.38)";
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(rx + rw * 0.1, ry + rh * 0.46);
        ctx.lineTo(rx + rw * 0.9, ry + rh * 0.46);
        ctx.moveTo(cx, ry + rh * 0.15);
        ctx.lineTo(cx, ry + rh * 0.85);
        ctx.stroke();

        // Mechanical top cover dome
        ctx.fillStyle = noseGrad;
        ctx.beginPath();
        ctx.moveTo(cx, ry + 2);
        ctx.lineTo(rx + rw * 0.72, ry + rh * 0.16);
        ctx.lineTo(rx + rw * 0.28, ry + rh * 0.16);
        ctx.closePath();
        ctx.fill();

        // Scientific Mast camera sensor (extremely detailed)
        ctx.fillStyle = "#37474f";
        ctx.fillRect(cx - 3, ry + rh * 0.08, 6, rh * 0.08);
        ctx.fillStyle = "#ff1744"; // red flashing camera lens
        ctx.beginPath();
        ctx.arc(cx, ry + rh * 0.06, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Metal rivets dots (maintenance hatches)
        ctx.fillStyle = "#212121";
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.arc(rx + rw * 0.16, ry + rh * (0.24 + i * 0.13), 2.0, 0, Math.PI * 2);
          ctx.arc(rx + rw * 0.84, ry + rh * (0.24 + i * 0.13), 2.0, 0, Math.PI * 2);
          ctx.fill();
        }

        drawPilotFace(ctx, cx, cyPos, cRadius, state.selectedPilot);

        // Heavy bolted window rim
        ctx.strokeStyle = "#424242";
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(cx, cyPos, cRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Heavy dark exhaust bell
        ctx.fillStyle = "#271206";
        ctx.fillRect(cx - rw * 0.16, ry + rh * 0.82, rw * 0.32, rh * 0.04);

      } else if (state.selectedRocket === "gold") {
        cyPos = ry + rh * 0.35;
        cRadius = rw * 0.24; // large circular view for golden pilot

        // Elegant angel crescent gold wings
        ctx.fillStyle = leftWingGrad;
        ctx.beginPath();
        ctx.moveTo(rx + rw * 0.3, ry + rh * 0.45);
        ctx.quadraticCurveTo(rx - rw * 0.45, ry + rh * 0.2, rx - rw * 0.22, ry + rh * 0.78);
        ctx.quadraticCurveTo(rx + rw * 0.05, ry + rh * 0.82, rx + rw * 0.35, ry + rh * 0.65);
        ctx.fill();

        ctx.fillStyle = rightWingGrad;
        ctx.beginPath();
        ctx.moveTo(rx + rw * 0.7, ry + rh * 0.45);
        ctx.quadraticCurveTo(rx + rw * 1.45, ry + rh * 0.2, rx + rw * 1.22, ry + rh * 0.78);
        ctx.quadraticCurveTo(rx + rw * 0.95, ry + rh * 0.82, rx + rw * 0.65, ry + rh * 0.65);
        ctx.fill();

        // Sleek white royal shield body
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.moveTo(cx, ry + rh * 0.04);
        ctx.bezierCurveTo(rx + rw * 0.85, ry + rh * 0.25, rx + rw * 0.8, ry + rh * 0.75, cx, ry + rh * 0.86);
        ctx.bezierCurveTo(rx + rw * 0.2, ry + rh * 0.75, rx + rw * 0.15, ry + rh * 0.25, cx, ry + rh * 0.04);
        ctx.fill();

        // Gold trim lining
        ctx.strokeStyle = "#ffd54f";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, ry + rh * 0.06);
        ctx.lineTo(cx, ry + rh * 0.22);
        ctx.moveTo(cx - rw * 0.12, ry + rh * 0.7);
        ctx.quadraticCurveTo(cx, ry + rh * 0.82, cx + rw * 0.12, ry + rh * 0.7);
        ctx.stroke();

        // Elegant panel grid pattern (royal luxury feeling)
        ctx.strokeStyle = "rgba(191, 155, 48, 0.25)";
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(cx, ry + rh * 0.5, rw * 0.42, 0, Math.PI * 2);
        ctx.stroke();

        drawPilotFace(ctx, cx, cyPos, cRadius, state.selectedPilot);

        // Shiny gold window rim
        ctx.strokeStyle = "#ffd54f";
        ctx.lineWidth = 3.0;
        ctx.beginPath();
        ctx.arc(cx, cyPos, cRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Polished gold thruster exhaust cup
        const nozzleG = ctx.createLinearGradient(cx - rw * 0.15, ry + rh * 0.83, cx + rw * 0.15, ry + rh * 0.86);
        nozzleG.addColorStop(0, "#ffa000");
        nozzleG.addColorStop(0.5, "#ffd54f");
        nozzleG.addColorStop(1, "#ffa000");
        ctx.fillStyle = nozzleG;
        ctx.fillRect(cx - rw * 0.12, ry + rh * 0.83, rw * 0.24, rh * 0.03);

      } else if (state.selectedRocket === "void") {
        cyPos = ry + rh * 0.38;
        cRadius = rw * 0.22;

        // Stealth carbon arrowhead fins
        ctx.fillStyle = leftWingGrad;
        ctx.beginPath();
        ctx.moveTo(rx + rw * 0.2, ry + rh * 0.6);
        ctx.lineTo(rx - rw * 0.32, ry + rh * 0.92);
        ctx.lineTo(rx + rw * 0.15, ry + rh * 0.85);
        ctx.fill();

        ctx.fillStyle = rightWingGrad;
        ctx.beginPath();
        ctx.moveTo(rx + rw * 0.8, ry + rh * 0.6);
        ctx.lineTo(rx + rw * 1.32, ry + rh * 0.92);
        ctx.lineTo(rx + rw * 0.85, ry + rh * 0.85);
        ctx.fill();

        // Faceted Angular radar-deflecting panels (Triangular carbon stealth body)
        // Draw left side panel (dark shade)
        ctx.fillStyle = "#111111";
        ctx.beginPath();
        ctx.moveTo(cx, ry);
        ctx.lineTo(cx, ry + rh * 0.76);
        ctx.lineTo(rx + rw * 0.24, ry + rh * 0.86);
        ctx.lineTo(rx + rw * 0.14, ry + rh * 0.52);
        ctx.closePath();
        ctx.fill();

        // Draw right side panel (slightly lighter shade)
        ctx.fillStyle = "#263238";
        ctx.beginPath();
        ctx.moveTo(cx, ry);
        ctx.lineTo(rx + rw * 0.86, ry + rh * 0.52);
        ctx.lineTo(rx + rw * 0.76, ry + rh * 0.86);
        ctx.lineTo(cx, ry + rh * 0.76);
        ctx.closePath();
        ctx.fill();

        // Carbon fiber fiber lines overlay on wings
        ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
        ctx.lineWidth = 1;
        for (let i = 0; i < rw * 0.4; i += 4) {
          ctx.beginPath();
          ctx.moveTo(rx - rw * 0.2 + i, ry + rh * 0.7);
          ctx.lineTo(rx - rw * 0.2 + i + 10, ry + rh * 0.9);
          ctx.stroke();
        }

        // Glowing red slits lines (heat dissipation vents)
        ctx.strokeStyle = "#ff1744";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(rx + rw * 0.35, ry + rh * 0.5);
        ctx.lineTo(cx - 4, ry + rh * 0.7);
        ctx.moveTo(rx + rw * 0.65, ry + rh * 0.5);
        ctx.lineTo(cx + 4, ry + rh * 0.7);
        ctx.stroke();

        drawPilotFace(ctx, cx, cyPos, cRadius, state.selectedPilot);

        // Stealth black window rim
        ctx.strokeStyle = "#ff1744";
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.arc(cx, cyPos, cRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Matte black stealth thruster nozzle
        ctx.fillStyle = "#111111";
        ctx.fillRect(cx - rw * 0.14, ry + rh * 0.83, rw * 0.28, rh * 0.035);

      } else {
        // Classic Red (Space Shuttle Stack / SpaceX Falcon Heavy hybrid)
        if (!state.boostersDetached) {
          // Draw Falcon Heavy boosters & central tank
          const srbWidth = rw * 0.16;
          const srbHeight = rh * 0.8;
          const srbLeftX = rx - srbWidth * 0.1;
          const srbRightX = rx + rw - srbWidth * 0.9;
          const srbY = ry + rh * 0.15;

          // 1. Draw Large Central Fuel Tank (Rust Orange gradient with welding seams)
          const etGrad = ctx.createLinearGradient(rx + rw * 0.2, ry, rx + rw * 0.8, ry);
          etGrad.addColorStop(0, "#d84315"); // dark rust orange
          etGrad.addColorStop(0.35, "#ff7043"); // sunlit orange
          etGrad.addColorStop(0.7, "#ff7043");
          etGrad.addColorStop(1, "#bf360c");
          ctx.fillStyle = etGrad;
          
          ctx.beginPath();
          ctx.moveTo(cx, ry + rh * 0.05); // dome top
          ctx.quadraticCurveTo(cx + rw * 0.34, ry + rh * 0.18, cx + rw * 0.3, ry + rh * 0.85);
          ctx.lineTo(cx - rw * 0.3, ry + rh * 0.85);
          ctx.quadraticCurveTo(cx - rw * 0.34, ry + rh * 0.18, cx, ry + rh * 0.05);
          ctx.fill();

          // Welding seams lines on External Tank (ET)
          ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
          ctx.lineWidth = 1.0;
          ctx.beginPath();
          ctx.moveTo(cx - rw * 0.25, ry + rh * 0.3); ctx.lineTo(cx + rw * 0.25, ry + rh * 0.3);
          ctx.moveTo(cx - rw * 0.28, ry + rh * 0.5); ctx.lineTo(cx + rw * 0.28, ry + rh * 0.5);
          ctx.moveTo(cx - rw * 0.29, ry + rh * 0.7); ctx.lineTo(cx + rw * 0.29, ry + rh * 0.7);
          ctx.stroke();

          // Center feedline fuel pipe running down ET
          ctx.fillStyle = "#b71c1c";
          ctx.fillRect(cx - 2, ry + rh * 0.2, 4, rh * 0.6);

          // 2. Draw Left Solid Rocket Booster (SRB with grid fins & panel cuts)
          const srbGrad = ctx.createLinearGradient(srbLeftX, srbY, srbLeftX + srbWidth, srbY);
          srbGrad.addColorStop(0, "#b0bec5");
          srbGrad.addColorStop(0.5, "#ffffff");
          srbGrad.addColorStop(1, "#90a4ae");
          ctx.fillStyle = srbGrad;
          ctx.fillRect(srbLeftX, srbY + srbHeight * 0.15, srbWidth, srbHeight * 0.85);

          // Left SRB structural bands
          ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
          ctx.fillRect(srbLeftX, srbY + srbHeight * 0.35, srbWidth, 3);
          ctx.fillRect(srbLeftX, srbY + srbHeight * 0.65, srbWidth, 3);
          
          // Left SRB Nose Cone (dark carbon composite)
          ctx.fillStyle = "#37474f";
          ctx.beginPath();
          ctx.moveTo(srbLeftX + srbWidth / 2, srbY);
          ctx.quadraticCurveTo(srbLeftX + srbWidth * 0.9, srbY + srbHeight * 0.15, srbLeftX + srbWidth, srbY + srbHeight * 0.15);
          ctx.lineTo(srbLeftX, srbY + srbHeight * 0.15);
          ctx.quadraticCurveTo(srbLeftX + srbWidth * 0.1, srbY + srbHeight * 0.15, srbLeftX + srbWidth / 2, srbY);
          ctx.fill();

          // Left booster grid fins (SpaceX styling)
          ctx.strokeStyle = "#37474f";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(srbLeftX - 3, srbY + srbHeight * 0.18, 5, 8);

          // 3. Draw Right Solid Rocket Booster (SRB)
          const srbRightGrad = ctx.createLinearGradient(srbRightX, srbY, srbRightX + srbWidth, srbY);
          srbRightGrad.addColorStop(0, "#b0bec5");
          srbRightGrad.addColorStop(0.5, "#ffffff");
          srbRightGrad.addColorStop(1, "#90a4ae");
          ctx.fillStyle = srbRightGrad;
          ctx.fillRect(srbRightX, srbY + srbHeight * 0.15, srbWidth, srbHeight * 0.85);

          // Right SRB structural bands
          ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
          ctx.fillRect(srbRightX, srbY + srbHeight * 0.35, srbWidth, 3);
          ctx.fillRect(srbRightX, srbY + srbHeight * 0.65, srbWidth, 3);

          // Right SRB Nose Cone
          ctx.fillStyle = "#37474f";
          ctx.beginPath();
          ctx.moveTo(srbRightX + srbWidth / 2, srbY);
          ctx.quadraticCurveTo(srbRightX + srbWidth * 0.9, srbY + srbHeight * 0.15, srbRightX + srbWidth, srbY + srbHeight * 0.15);
          ctx.lineTo(srbRightX, srbY + srbHeight * 0.15);
          ctx.quadraticCurveTo(srbRightX + srbWidth * 0.1, srbY + srbHeight * 0.15, srbRightX + srbWidth / 2, srbY);
          ctx.fill();

          // Right booster grid fins
          ctx.strokeStyle = "#37474f";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(srbRightX + srbWidth - 2, srbY + srbHeight * 0.18, 5, 8);

          // 4. Draw Space Shuttle Orbiter mounted on top
          const orbiterWidth = rw * 0.55;
          const orbiterHeight = rh * 0.72;
          const orbiterX = cx - orbiterWidth / 2;
          const orbiterY = ry + rh * 0.22;

          // Shuttle wings (delta white shape with black thermal protection tile borders)
          ctx.fillStyle = "#cfd8dc";
          ctx.beginPath();
          ctx.moveTo(cx, orbiterY + orbiterHeight * 0.2);
          ctx.lineTo(orbiterX + orbiterWidth, orbiterY + orbiterHeight * 0.85); // right wing tip
          ctx.lineTo(orbiterX + orbiterWidth * 0.8, orbiterY + orbiterHeight * 0.85);
          ctx.lineTo(orbiterX + orbiterWidth * 0.2, orbiterY + orbiterHeight * 0.85);
          ctx.lineTo(orbiterX, orbiterY + orbiterHeight * 0.85); // left wing tip
          ctx.closePath();
          ctx.fill();

          // Wing black heat tiles edges
          ctx.fillStyle = "#263238";
          ctx.beginPath();
          ctx.moveTo(orbiterX, orbiterY + orbiterHeight * 0.85);
          ctx.lineTo(orbiterX + orbiterWidth * 0.15, orbiterY + orbiterHeight * 0.85);
          ctx.lineTo(cx - orbiterWidth * 0.12, orbiterY + orbiterHeight * 0.45);
          ctx.lineTo(cx, orbiterY + orbiterHeight * 0.2);
          ctx.lineTo(cx + orbiterWidth * 0.12, orbiterY + orbiterHeight * 0.45);
          ctx.lineTo(orbiterX + orbiterWidth * 0.85, orbiterY + orbiterHeight * 0.85);
          ctx.lineTo(orbiterX + orbiterWidth, orbiterY + orbiterHeight * 0.85);
          ctx.stroke();

          // Shuttle Fuselage body
          const orbiterGrad = ctx.createLinearGradient(orbiterX, orbiterY, orbiterX + orbiterWidth, orbiterY);
          orbiterGrad.addColorStop(0, "#eceff1");
          orbiterGrad.addColorStop(0.35, "#ffffff");
          orbiterGrad.addColorStop(0.7, "#ffffff");
          orbiterGrad.addColorStop(1, "#b0bec5");
          ctx.fillStyle = orbiterGrad;
          
          ctx.beginPath();
          ctx.moveTo(cx, orbiterY); // shuttle nose cap
          ctx.quadraticCurveTo(cx + orbiterWidth * 0.35, orbiterY + orbiterHeight * 0.3, cx + orbiterWidth * 0.3, orbiterY + orbiterHeight * 0.85);
          ctx.lineTo(cx - orbiterWidth * 0.3, orbiterY + orbiterHeight * 0.85);
          ctx.quadraticCurveTo(cx - orbiterWidth * 0.35, orbiterY + orbiterHeight * 0.3, cx, orbiterY);
          ctx.fill();

          // Black heat tiles nose tip
          ctx.fillStyle = "#212121";
          ctx.beginPath();
          ctx.moveTo(cx, orbiterY);
          ctx.quadraticCurveTo(cx + orbiterWidth * 0.16, orbiterY + orbiterHeight * 0.08, cx + orbiterWidth * 0.12, orbiterY + orbiterHeight * 0.12);
          ctx.lineTo(cx - orbiterWidth * 0.12, orbiterY + orbiterHeight * 0.12);
          ctx.quadraticCurveTo(cx - orbiterWidth * 0.16, orbiterY + orbiterHeight * 0.08, cx, orbiterY);
          ctx.fill();

          // Shuttle fuselage structural panels lines
          ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
          ctx.lineWidth = 1.0;
          ctx.beginPath();
          ctx.moveTo(orbiterX + orbiterWidth * 0.3, orbiterY + orbiterHeight * 0.5);
          ctx.lineTo(orbiterX + orbiterWidth * 0.7, orbiterY + orbiterHeight * 0.5);
          ctx.stroke();

          // Cabin glass and Pilot face
          cyPos = orbiterY + orbiterHeight * 0.33;
          cRadius = orbiterWidth * 0.38; // larger window for classic stack
          drawPilotFace(ctx, cx, cyPos, cRadius, state.selectedPilot);

          // Window black rim
          ctx.strokeStyle = "#212121";
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(cx, cyPos, cRadius, 0, Math.PI * 2);
          ctx.stroke();

          // Main exhaust nozzle bell with titanium discoloration
          const bellGrad = ctx.createLinearGradient(cx - rw * 0.15, ry + rh * 0.8, cx + rw * 0.15, ry + rh * 0.83);
          bellGrad.addColorStop(0, "#455a64");
          bellGrad.addColorStop(0.4, "#5c6bc0"); // heat indigo
          bellGrad.addColorStop(0.7, "#7e57c2"); // heat purple
          bellGrad.addColorStop(1, "#37474f");
          ctx.fillStyle = bellGrad;
          ctx.fillRect(cx - rw * 0.13, ry + rh * 0.8, rw * 0.26, rh * 0.03);

        } else {
          // --- DRAW ONLY DETACHED SLEEK ORBITER SHUTTLE (AFTER SEPARATION) ---
          
          // Shuttle wings (delta white shape)
          ctx.fillStyle = "#cfd8dc";
          ctx.beginPath();
          ctx.moveTo(cx, ry + rh * 0.2);
          ctx.lineTo(rx + rw * 0.95, ry + rh * 0.85); // right wing tip
          ctx.lineTo(rx + rw * 0.8, ry + rh * 0.85);
          ctx.lineTo(rx + rw * 0.2, ry + rh * 0.85);
          ctx.lineTo(rx + rw * 0.05, ry + rh * 0.85); // left wing tip
          ctx.closePath();
          ctx.fill();

          // Wing black heat tiles edges
          ctx.fillStyle = "#263238";
          ctx.beginPath();
          ctx.moveTo(rx + rw * 0.05, ry + rh * 0.85);
          ctx.lineTo(rx + rw * 0.2, ry + rh * 0.85);
          ctx.lineTo(cx - rw * 0.12, ry + rh * 0.45);
          ctx.lineTo(cx, ry + rh * 0.2);
          ctx.lineTo(cx + rw * 0.12, ry + rh * 0.45);
          ctx.lineTo(rx + rw * 0.8, ry + rh * 0.85);
          ctx.lineTo(rx + rw * 0.95, ry + rh * 0.85);
          ctx.stroke();

          // Shuttle Fuselage body
          const orbiterGrad = ctx.createLinearGradient(rx + rw * 0.2, ry + rh * 0.1, rx + rw * 0.8, ry + rh * 0.1);
          orbiterGrad.addColorStop(0, "#eceff1");
          orbiterGrad.addColorStop(0.35, "#ffffff");
          orbiterGrad.addColorStop(0.7, "#ffffff");
          orbiterGrad.addColorStop(1, "#b0bec5");
          ctx.fillStyle = orbiterGrad;
          
          ctx.beginPath();
          ctx.moveTo(cx, ry + rh * 0.05); // shuttle nose cap
          ctx.quadraticCurveTo(cx + rw * 0.28, ry + rh * 0.35, cx + rw * 0.24, ry + rh * 0.85);
          ctx.lineTo(cx - rw * 0.24, ry + rh * 0.85);
          ctx.quadraticCurveTo(cx - rw * 0.28, ry + rh * 0.35, cx, ry + rh * 0.05);
          ctx.fill();

          // Black heat tiles nose tip
          ctx.fillStyle = "#212121";
          ctx.beginPath();
          ctx.moveTo(cx, ry + rh * 0.05);
          ctx.quadraticCurveTo(cx + rw * 0.14, ry + rh * 0.12, cx + rw * 0.10, ry + rh * 0.16);
          ctx.lineTo(cx - rw * 0.10, ry + rh * 0.16);
          ctx.quadraticCurveTo(cx - rw * 0.14, ry + rh * 0.12, cx, ry + rh * 0.05);
          ctx.fill();

          // Cabin glass and Pilot face
          cyPos = ry + rh * 0.36;
          cRadius = rw * 0.24; // larger window for detached shuttle
          drawPilotFace(ctx, cx, cyPos, cRadius, state.selectedPilot);

          // Window black rim
          ctx.strokeStyle = "#212121";
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.arc(cx, cyPos, cRadius, 0, Math.PI * 2);
          ctx.stroke();

          // Titanium exhaust lip
          const bellGrad = ctx.createLinearGradient(cx - rw * 0.15, ry + rh * 0.82, cx + rw * 0.15, ry + rh * 0.85);
          bellGrad.addColorStop(0, "#455a64");
          bellGrad.addColorStop(0.4, "#5c6bc0");
          bellGrad.addColorStop(0.7, "#7e57c2");
          bellGrad.addColorStop(1, "#37474f");
          ctx.fillStyle = bellGrad;
          ctx.fillRect(cx - rw * 0.14, ry + rh * 0.82, rw * 0.28, rh * 0.03);
        }

        // Blinking wingtip navigation lights (highly realistic aviation detail)
        const flashOn = Math.floor(timestamp / 300) % 2 === 0;
        if (flashOn) {
          ctx.save();
          ctx.shadowBlur = 10;
          
          let wingL_X = rx - rw * 0.1;
          let wingL_Y = ry + rh * 0.85;
          let wingR_X = rx + rw * 1.1;
          let wingR_Y = ry + rh * 0.85;

          if (state.selectedRocket === "cyber") {
            wingL_X = rx - rw * 0.35; wingL_Y = ry + rh * 0.3;
            wingR_X = rx + rw * 1.35; wingR_Y = ry + rh * 0.3;
          } else if (state.selectedRocket === "mars") {
            wingL_X = rx - rw * 0.35; wingL_Y = ry + rh * 0.44;
            wingR_X = rx + rw * 1.35; wingR_Y = ry + rh * 0.44;
          } else if (state.selectedRocket === "gold") {
            wingL_X = rx - rw * 0.38; wingL_Y = ry + rh * 0.52;
            wingR_X = rx + rw * 1.38; wingR_Y = ry + rh * 0.52;
          } else if (state.selectedRocket === "void") {
            wingL_X = rx - rw * 0.32; wingL_Y = ry + rh * 0.92;
            wingR_X = rx + rw * 1.32; wingR_Y = ry + rh * 0.92;
          } else {
            // classic shuttle
            const isDetached = state.boostersDetached;
            const wW = isDetached ? rw * 0.95 : rw * 1.0;
            wingL_X = cx - wW / 2; wingL_Y = ry + rh * 0.85;
            wingR_X = cx + wW / 2; wingR_Y = ry + rh * 0.85;
          }

          // Left wing tip: Red light
          ctx.shadowColor = "#ff1744";
          ctx.fillStyle = "#ff1744";
          ctx.beginPath();
          ctx.arc(wingL_X, wingL_Y, 4.0, 0, Math.PI * 2);
          ctx.fill();

          // Right wing tip: Green light
          ctx.shadowColor = "#00e676";
          ctx.fillStyle = "#00e676";
          ctx.beginPath();
          ctx.arc(wingR_X, wingR_Y, 4.0, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        }
      }
      ctx.restore();

      // Dynamic Thruster Exhaust Flame System (changes style & color depending on altitude zone index)
      if (state.gameState === "PLAYING") {
        ctx.save();
        
        const activeZoneIdx = getCurrentZoneIndex(state.gameTime);
        let fCol1 = "#ff5722"; // outer flame
        let fCol2 = "#ffeb3b"; // inner core
        let isIon = false;
        let isPlasma = false;
        
        if (activeZoneIdx >= 4) {
          // Purple/Magenta Plasma Engine (Deep Space)
          fCol1 = "#d500f9";
          fCol2 = "#f50057";
          isPlasma = true;
        } else if (activeZoneIdx >= 2) {
          // Cyan/Blue Ion Engine (Space / Orbit / Mars)
          fCol1 = "#00e5ff";
          fCol2 = "#ffffff";
          isIon = true;
        }

        ctx.shadowBlur = isIon ? 18 : (isPlasma ? 22 : 12);
        ctx.shadowColor = fCol1;
        
        // Nozzle positions
        const mainFlameY = (state.selectedRocket === "classic" && !state.boostersDetached) ? ry + rh * 0.83 : ry + rh * 0.85;
        const lengthScale = 1.0 + (activeZoneIdx * 0.12) + (Math.sin(timestamp * 0.05) * 0.08); // dynamic exhaust length pulsing
        
        // 1. Draw Main Engine Flame
        ctx.fillStyle = fCol1;
        ctx.beginPath();
        ctx.moveTo(cx - rw * 0.12, mainFlameY);
        ctx.lineTo(cx, mainFlameY + (rh * 0.16 * lengthScale));
        ctx.lineTo(cx + rw * 0.12, mainFlameY);
        ctx.fill();

        ctx.shadowColor = fCol2;
        ctx.fillStyle = fCol2;
        ctx.beginPath();
        ctx.moveTo(cx - rw * 0.07, mainFlameY);
        ctx.lineTo(cx, mainFlameY + (rh * 0.10 * lengthScale));
        ctx.lineTo(cx + rw * 0.07, mainFlameY);
        ctx.fill();

        // 2. Draw Side Booster flames (SRB chemical fire) before separation
        if (state.selectedRocket === "classic" && !state.boostersDetached) {
          const srbWidth = rw * 0.16;
          const srbHeight = rh * 0.8;
          const srbLeftX = rx - srbWidth * 0.1;
          const srbRightX = rx + rw - srbWidth * 0.9;
          const srbFlameY = ry + rh * 0.15 + srbHeight;

          // Left SRB flame
          ctx.shadowColor = "#ffb74d";
          ctx.fillStyle = "#ff5722";
          ctx.beginPath();
          ctx.moveTo(srbLeftX, srbFlameY);
          ctx.lineTo(srbLeftX + srbWidth / 2, srbFlameY + (rh * 0.2 * (0.95 + Math.random() * 0.25)));
          ctx.lineTo(srbLeftX + srbWidth, srbFlameY);
          ctx.fill();

          ctx.fillStyle = "#ffd54f";
          ctx.beginPath();
          ctx.moveTo(srbLeftX + srbWidth * 0.25, srbFlameY);
          ctx.lineTo(srbLeftX + srbWidth / 2, srbFlameY + (rh * 0.13 * (0.9 + Math.random() * 0.15)));
          ctx.lineTo(srbLeftX + srbWidth * 0.75, srbFlameY);
          ctx.fill();

          // Right SRB flame
          ctx.fillStyle = "#ff5722";
          ctx.beginPath();
          ctx.moveTo(srbRightX, srbFlameY);
          ctx.lineTo(srbRightX + srbWidth / 2, srbFlameY + (rh * 0.2 * (0.95 + Math.random() * 0.25)));
          ctx.lineTo(srbRightX + srbWidth, srbFlameY);
          ctx.fill();

          ctx.fillStyle = "#ffd54f";
          ctx.beginPath();
          ctx.moveTo(srbRightX + srbWidth * 0.25, srbFlameY);
          ctx.lineTo(srbRightX + srbWidth / 2, srbFlameY + (rh * 0.13 * (0.9 + Math.random() * 0.15)));
          ctx.lineTo(srbRightX + srbWidth * 0.75, srbFlameY);
          ctx.fill();
        }
        
        ctx.restore();
      }

      // --- ATMOSPHERIC FRICTION GLOW (ATMOSFER SÜRTÜNMESİ) ---
      if (state.activeZoneIndex === 1 && state.gameState === "PLAYING") {
        ctx.save();
        const tipX = cx;
        const tipY = ry;
        
        // Draw friction plasma cone
        const noseGlow = ctx.createRadialGradient(tipX, tipY - 2, 0, tipX, tipY + 12, 18);
        noseGlow.addColorStop(0, "#ffffff");
        noseGlow.addColorStop(0.3, "#ffeb3b");
        noseGlow.addColorStop(0.6, "rgba(255, 87, 34, 0.95)");
        noseGlow.addColorStop(1, "rgba(244, 67, 54, 0)");
        
        ctx.fillStyle = noseGlow;
        ctx.beginPath();
        ctx.moveTo(tipX - 18, tipY + 10);
        ctx.quadraticCurveTo(tipX, tipY - 8, tipX + 18, tipY + 10);
        ctx.quadraticCurveTo(tipX, tipY + 14, tipX - 18, tipY + 10);
        ctx.fill();
        ctx.restore();

        // Spawn upward spark particles from the nose cone tip
        if (Math.random() < 0.35) {
          const p = state.particles.find(p => !p.active);
          if (p) {
            p.active = true;
            p.x = tipX + (Math.random() * 8 - 4);
            p.y = tipY;
            p.vx = (Math.random() - 0.5) * 3;
            p.vy = -(Math.random() * 4 + 3.5); // flying upwards
            p.size = Math.random() * 3 + 1.2;
            p.color = Math.random() > 0.45 ? "#ffd54f" : "#ff5722";
            p.alpha = 1;
            p.maxLife = Math.random() * 15 + 10;
            p.life = p.maxLife;
          }
        }
      }

      // Draw Glowing Shield bubble if active
      if (state.shieldDuration > 0) {
        ctx.save();
        // Pulse bubble radius
        const shieldPulseRadius = (rw * 1.1) + Math.sin(timestamp * 0.015) * 4;
        const shieldGrad = ctx.createRadialGradient(
          rx + rw / 2, ry + rh / 2, rw * 0.3,
          rx + rw / 2, ry + rh / 2, shieldPulseRadius
        );
        shieldGrad.addColorStop(0, "rgba(0, 229, 255, 0.0)");
        shieldGrad.addColorStop(0.85, "rgba(0, 229, 255, 0.25)");
        shieldGrad.addColorStop(1, "rgba(0, 229, 255, 0.7)");
        ctx.fillStyle = shieldGrad;
        
        ctx.beginPath();
        ctx.arc(rx + rw / 2, ry + rh / 2, shieldPulseRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw bright outer ring
        ctx.strokeStyle = "#00e5ff";
        ctx.lineWidth = 2.0;
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();

      // --- OBSTACLES PHYSICS & RENDERING ---
      const activeSlow = state.slowDuration > 0;
      const obsSlowMult = activeSlow ? 0.35 : 1.0;

      state.obstacles.forEach((obs) => {
        if (!obs.active) return;

        // Move obstacle down
        if (state.gameState === "PLAYING") {
          obs.y += obs.speed * obsSlowMult;

          // Apply path curves
          if (obs.pathType === "zigzag") {
            const timeVal = timestamp * 0.003;
            obs.x = obs.startX + Math.sin(timeVal) * obs.amplitude;
          } else if (obs.pathType === "sine") {
            obs.x += Math.sin(obs.y * 0.02) * 2;
          }

          // Spin rotations
          obs.angle += obs.rotSpeed * obsSlowMult;

          // Split obstacle warning if boundaries reached
          if (obs.y > canvas.height + obs.height) {
            obs.active = false;
            return;
          }
        }

        // Draw Obstacle
        ctx.save();
        ctx.translate(obs.x + obs.width / 2, obs.y + obs.height / 2);
        ctx.rotate(obs.angle);

        // Styling and drawing specific shapes based on type
        if (obs.type === "BIRD") {
          // Bird with body, beak and flapping wings drawn with curves
          ctx.fillStyle = obs.color;
          const flap = Math.sin(timestamp * 0.015) * obs.height * 0.6;
          
          // Wings
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(-obs.width * 0.4, -obs.height * 0.5 + flap, -obs.width * 0.5, flap);
          ctx.quadraticCurveTo(-obs.width * 0.2, flap * 0.2, 0, 5);
          ctx.quadraticCurveTo(obs.width * 0.2, flap * 0.2, obs.width * 0.5, flap);
          ctx.quadraticCurveTo(obs.width * 0.4, -obs.height * 0.5 + flap, 0, 0);
          ctx.fill();

          // Body
          ctx.fillStyle = "#eceff1";
          ctx.beginPath();
          ctx.ellipse(0, 2, obs.width * 0.15, obs.height * 0.35, 0, 0, Math.PI * 2);
          ctx.fill();

          // Beak
          ctx.fillStyle = "#ffb300";
          ctx.beginPath();
          ctx.moveTo(0, obs.height * 0.35);
          ctx.lineTo(-3, obs.height * 0.55);
          ctx.lineTo(3, obs.height * 0.55);
          ctx.fill();
        } else if (obs.type === "PLANE" || obs.type === "HIGH_ALTITUDE_PLANE") {
          // Metallic body gradient
          const jetGrad = ctx.createLinearGradient(-obs.width / 2, 0, obs.width / 2, 0);
          jetGrad.addColorStop(0, "#78909c");
          jetGrad.addColorStop(0.5, "#cfd8dc");
          jetGrad.addColorStop(1, "#546e7a");
          ctx.fillStyle = jetGrad;

          // Main wings
          ctx.beginPath();
          ctx.ellipse(0, 0, obs.width * 0.5, obs.height * 0.18, 0, 0, Math.PI * 2);
          ctx.fill();

          // Fuselage body
          ctx.fillStyle = "#37474f";
          ctx.beginPath();
          ctx.ellipse(0, 0, obs.width * 0.12, obs.height * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();

          // Cabin glass
          ctx.fillStyle = "#80deea";
          ctx.beginPath();
          ctx.ellipse(0, obs.height * 0.25, obs.width * 0.08, obs.height * 0.1, 0, 0, Math.PI * 2);
          ctx.fill();

          // Flashing red/green wings tip lights
          ctx.fillStyle = Math.floor(timestamp / 300) % 2 === 0 ? "#ff1744" : "rgba(255,23,68,0.2)";
          ctx.beginPath();
          ctx.arc(-obs.width * 0.48, 0, 4, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = Math.floor(timestamp / 300) % 2 === 0 ? "#00e676" : "rgba(0,230,118,0.2)";
          ctx.beginPath();
          ctx.arc(obs.width * 0.48, 0, 4, 0, Math.PI * 2);
          ctx.fill();
        } else if (obs.type === "HELICOPTER") {
          // Body bubble
          const bodyGrad = ctx.createRadialGradient(-2, -2, 2, 0, 0, obs.width * 0.35);
          bodyGrad.addColorStop(0, "#ffe082");
          bodyGrad.addColorStop(1, obs.color);
          ctx.fillStyle = bodyGrad;
          
          ctx.beginPath();
          ctx.arc(0, 0, obs.width * 0.35, 0, Math.PI * 2);
          ctx.fill();

          // Cabin windshield
          ctx.fillStyle = "#e0f7fa";
          ctx.beginPath();
          ctx.arc(obs.width * 0.12, obs.height * 0.12, obs.width * 0.2, 0, Math.PI, true);
          ctx.fill();

          // Tail boom and rotor fin
          ctx.strokeStyle = "#455a64";
          ctx.lineWidth = 4.0;
          ctx.beginPath();
          ctx.moveTo(0, -obs.height * 0.1);
          ctx.lineTo(-obs.width * 0.45, -obs.height * 0.3);
          ctx.stroke();

          // Tail rotor blades
          ctx.save();
          ctx.translate(-obs.width * 0.45, -obs.height * 0.3);
          ctx.rotate(timestamp * 0.08);
          ctx.strokeStyle = "#cfd8dc";
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.moveTo(-10, 0); ctx.lineTo(10, 0);
          ctx.stroke();
          ctx.restore();

          // Main Rotors blur (semi-transparent rotating ellipse)
          ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
          ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
          ctx.lineWidth = 2.0;
          ctx.save();
          ctx.rotate(timestamp * 0.05);
          ctx.beginPath();
          ctx.ellipse(0, -obs.height * 0.45, obs.width * 0.65, obs.height * 0.12, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();

          // Landing skids
          ctx.strokeStyle = "#37474f";
          ctx.lineWidth = 3.0;
          ctx.beginPath();
          ctx.moveTo(-obs.width * 0.2, obs.height * 0.38);
          ctx.lineTo(obs.width * 0.2, obs.height * 0.38);
          ctx.stroke();
        } else if (obs.type === "DRONE") {
          // Drone core body
          ctx.fillStyle = "#37474f";
          ctx.beginPath();
          ctx.arc(0, 0, obs.width * 0.2, 0, Math.PI * 2);
          ctx.fill();
          
          // Quad Arms
          ctx.strokeStyle = obs.color;
          ctx.lineWidth = 4.0;
          ctx.beginPath();
          ctx.moveTo(-obs.width * 0.4, -obs.height * 0.4);
          ctx.lineTo(obs.width * 0.4, obs.height * 0.4);
          ctx.moveTo(obs.width * 0.4, -obs.height * 0.4);
          ctx.lineTo(-obs.width * 0.4, obs.height * 0.4);
          ctx.stroke();

          // 4 spinning rotors (semi-transparent circles)
          const rotorPositions = [
            [-obs.width * 0.4, -obs.height * 0.4],
            [obs.width * 0.4, -obs.height * 0.4],
            [-obs.width * 0.4, obs.height * 0.4],
            [obs.width * 0.4, obs.height * 0.4]
          ];
          ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
          ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
          ctx.lineWidth = 1.0;
          rotorPositions.forEach(([rxPos, ryPos]) => {
            ctx.beginPath();
            ctx.arc(rxPos, ryPos, obs.width * 0.18, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // Rotor hub pin
            ctx.fillStyle = "#ffb74d";
            ctx.beginPath();
            ctx.arc(rxPos, ryPos, 3, 0, Math.PI * 2);
            ctx.fill();
          });

          // Flashing camera lens led light
          ctx.fillStyle = Math.floor(timestamp / 200) % 2 === 0 ? "#00e5ff" : "#ff1744";
          ctx.beginPath();
          ctx.arc(0, obs.height * 0.12, 4, 0, Math.PI * 2);
          ctx.fill();
        } else if (obs.type === "WEATHER_BALLOON") {
          // Detailed weather balloon (yellow and orange vertical stripes)
          ctx.save();
          // Draw balloon drop shape
          ctx.beginPath();
          ctx.moveTo(0, obs.height * 0.2);
          ctx.quadraticCurveTo(-obs.width * 0.5, obs.height * 0.1, -obs.width * 0.5, -obs.height * 0.2);
          ctx.arc(0, -obs.height * 0.2, obs.width * 0.5, Math.PI, 0, false);
          ctx.quadraticCurveTo(obs.width * 0.5, obs.height * 0.1, 0, obs.height * 0.2);
          ctx.closePath();
          
          // Stripes gradient
          const balloonGrad = ctx.createLinearGradient(-obs.width * 0.5, 0, obs.width * 0.5, 0);
          balloonGrad.addColorStop(0, "#d84315");
          balloonGrad.addColorStop(0.25, "#ffd54f");
          balloonGrad.addColorStop(0.5, "#d84315");
          balloonGrad.addColorStop(0.75, "#ffd54f");
          balloonGrad.addColorStop(1, "#d84315");
          ctx.fillStyle = balloonGrad;
          ctx.fill();
          ctx.restore();

          // String cables
          ctx.strokeStyle = "#90a4ae";
          ctx.lineWidth = 1.0;
          ctx.beginPath();
          ctx.moveTo(-obs.width * 0.12, obs.height * 0.2);
          ctx.lineTo(-obs.width * 0.08, obs.height * 0.35);
          ctx.moveTo(obs.width * 0.12, obs.height * 0.2);
          ctx.lineTo(obs.width * 0.08, obs.height * 0.35);
          ctx.stroke();

          // Detailed basket
          const basketGrad = ctx.createLinearGradient(-5, obs.height * 0.35, 5, obs.height * 0.35 + 8);
          basketGrad.addColorStop(0, "#8d6e63");
          basketGrad.addColorStop(1, "#5d4037");
          ctx.fillStyle = basketGrad;
          ctx.fillRect(-6, obs.height * 0.35, 12, 9);
        } else if (obs.type === "METEOR" || obs.type === "MARS_METEOR" || obs.type === "GIANT_METEOR" || obs.type === "METEOR_DEBRIS") {
          // Craggy asteroid with 3D Radial shading
          const radGrad = ctx.createRadialGradient(
            -obs.width * 0.15, -obs.height * 0.15, obs.width * 0.05,
            0, 0, obs.width * 0.5
          );
          
          let mainCol = obs.color;
          let darkCol = "#3e2723";
          let lightCol = "#bcaaa4";
          
          if (obs.type === "MARS_METEOR") {
            darkCol = "#5d0c00";
            lightCol = "#ff7043";
          } else if (obs.type === "METEOR_DEBRIS") {
            darkCol = "#2d1d18";
            lightCol = "#a1887f";
          }
          
          radGrad.addColorStop(0, lightCol);
          radGrad.addColorStop(0.45, mainCol);
          radGrad.addColorStop(1, darkCol);
          ctx.fillStyle = radGrad;

          // Draw jagged rock shape
          ctx.beginPath();
          const points = 8;
          for (let i = 0; i < points; i++) {
            const angle = (i / points) * Math.PI * 2;
            const roughness = 0.82 + (Math.sin(i * 2.3) * 0.14);
            const rx = Math.cos(angle) * (obs.width / 2) * roughness;
            const ry = Math.sin(angle) * (obs.height / 2) * roughness;
            if (i === 0) ctx.moveTo(rx, ry);
            else ctx.lineTo(rx, ry);
          }
          ctx.closePath();
          ctx.fill();
          
          // Crater highlights
          ctx.strokeStyle = "rgba(255,255,255,0.12)";
          ctx.fillStyle = darkCol;
          ctx.lineWidth = 1.5;
          
          // Draw a crater 1
          ctx.beginPath();
          ctx.arc(-obs.width * 0.15, -obs.height * 0.15, obs.width * 0.12, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Draw a crater 2
          ctx.beginPath();
          ctx.arc(obs.width * 0.18, obs.height * 0.08, obs.width * 0.08, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Friction particle spark trail behind meteor if playing
          if (state.gameState === "PLAYING" && Math.random() < 0.25) {
            // Draw a faint glowing fire tail behind the rock (pointing up)
            ctx.restore();
            ctx.save();
            const glowTail = ctx.createLinearGradient(obs.x + obs.width / 2, obs.y, obs.x + obs.width / 2, obs.y - obs.height * 1.5);
            glowTail.addColorStop(0, "rgba(255, 87, 34, 0.45)");
            glowTail.addColorStop(0.5, "rgba(244, 67, 54, 0.2)");
            glowTail.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = glowTail;
            ctx.beginPath();
            ctx.moveTo(obs.x + obs.width * 0.25, obs.y + obs.height * 0.2);
            ctx.lineTo(obs.x + obs.width / 2, obs.y - obs.height * 1.5);
            ctx.lineTo(obs.x + obs.width * 0.75, obs.y + obs.height * 0.2);
            ctx.fill();
            
            // Restore rotation for standard loop
            ctx.translate(obs.x + obs.width / 2, obs.y + obs.height / 2);
            ctx.rotate(obs.angle);
          }
        } else if (obs.type === "SATELLITE") {
          // Satellite Solar panels with glowing grid lines
          ctx.fillStyle = "#1565c0";
          ctx.strokeStyle = "#90caf9";
          ctx.lineWidth = 1.0;
          // Left panel
          ctx.fillRect(-obs.width * 0.65, -obs.height * 0.15, obs.width * 0.35, obs.height * 0.3);
          ctx.strokeRect(-obs.width * 0.65, -obs.height * 0.15, obs.width * 0.35, obs.height * 0.3);
          // Right panel
          ctx.fillRect(obs.width * 0.3, -obs.height * 0.15, obs.width * 0.35, obs.height * 0.3);
          ctx.strokeRect(obs.width * 0.3, -obs.height * 0.15, obs.width * 0.35, obs.height * 0.3);
          
          // Connectors
          ctx.strokeStyle = "#cfd8dc";
          ctx.lineWidth = 3.0;
          ctx.beginPath();
          ctx.moveTo(-obs.width * 0.3, 0); ctx.lineTo(obs.width * 0.3, 0);
          ctx.stroke();

          // Satellite golden capsule core body
          const goldGrad = ctx.createRadialGradient(-3, -3, 1, 0, 0, obs.width * 0.2);
          goldGrad.addColorStop(0, "#ffe082");
          goldGrad.addColorStop(0.5, "#ffd54f");
          goldGrad.addColorStop(1, "#ff8f00");
          ctx.fillStyle = goldGrad;
          ctx.beginPath();
          ctx.arc(0, 0, obs.width * 0.2, 0, Math.PI * 2);
          ctx.fill();

          // Dish antenna
          ctx.strokeStyle = "#cfd8dc";
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.arc(0, -obs.height * 0.28, 8, 0, Math.PI, true);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, -obs.height * 0.2);
          ctx.lineTo(0, -obs.height * 0.35);
          ctx.stroke();
        } else if (obs.type === "ANOMALY") {
          // Pulsing swirling black hole rift
          const pulse = 1.0 + Math.sin(timestamp * 0.02) * 0.15;
          
          // Swirling nebula background ring
          ctx.save();
          ctx.rotate(timestamp * 0.015);
          const swirlGrad = ctx.createRadialGradient(0, 0, obs.width * 0.1, 0, 0, obs.width * 0.6 * pulse);
          swirlGrad.addColorStop(0, "rgba(0,0,0,1)");
          swirlGrad.addColorStop(0.3, "rgba(213, 0, 249, 0.45)");
          swirlGrad.addColorStop(0.6, "rgba(3, 169, 244, 0.3)");
          swirlGrad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = swirlGrad;
          ctx.beginPath();
          ctx.ellipse(0, 0, obs.width * 0.6 * pulse, obs.height * 0.45 * pulse, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Core event horizon (solid black circle with glowing purple outline)
          ctx.shadowBlur = 15;
          ctx.shadowColor = "#e040fb";
          ctx.fillStyle = "#000000";
          ctx.beginPath();
          ctx.arc(0, 0, obs.width * 0.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#e040fb";
          ctx.lineWidth = 2.0;
          ctx.stroke();
        } else if (obs.type === "DARK_ENERGY_SPHERE") {
          // High-tech plasma orb
          const pulse = 1.0 + Math.sin(timestamp * 0.03) * 0.08;
          ctx.shadowBlur = 20;
          ctx.shadowColor = "#00e5ff";
          
          const energyGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, obs.width * 0.45 * pulse);
          energyGrad.addColorStop(0, "#ffffff");
          energyGrad.addColorStop(0.3, "#00e5ff");
          energyGrad.addColorStop(0.7, "#651fff");
          energyGrad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = energyGrad;
          
          ctx.beginPath();
          ctx.arc(0, 0, obs.width * 0.5 * pulse, 0, Math.PI * 2);
          ctx.fill();
        } else if (obs.type === "SPACE_DEBRIS" || obs.type === "ROCKET_PIECE" || obs.type === "BALLOON_PARTICLE") {
          // Metal scrap plate with jagged edges and rivets
          const scrapGrad = ctx.createLinearGradient(-obs.width/2, -obs.height/2, obs.width/2, obs.height/2);
          scrapGrad.addColorStop(0, "#78909c");
          scrapGrad.addColorStop(0.5, "#b0bec5");
          scrapGrad.addColorStop(1, "#37474f");
          ctx.fillStyle = scrapGrad;
          
          ctx.beginPath();
          ctx.moveTo(-obs.width * 0.45, -obs.height * 0.25);
          ctx.lineTo(obs.width * 0.45, -obs.height * 0.35);
          ctx.lineTo(obs.width * 0.3, obs.height * 0.35);
          ctx.lineTo(-obs.width * 0.35, obs.height * 0.3);
          ctx.closePath();
          ctx.fill();

          // Dark panel division line
          ctx.strokeStyle = "#263238";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, -obs.height * 0.3);
          ctx.lineTo(0, obs.height * 0.3);
          ctx.stroke();

          // Little panel circles (rivets)
          ctx.fillStyle = "#cfd8dc";
          ctx.beginPath();
          ctx.arc(-obs.width * 0.2, -obs.height * 0.1, 1.8, 0, Math.PI * 2);
          ctx.arc(obs.width * 0.2, obs.height * 0.2, 1.8, 0, Math.PI * 2);
          ctx.fill();

        } else if (obs.type === "MARS_ROCK" || obs.type === "ORBITAL_STONE" || obs.type === "COMET_FRAGMENT" || obs.type === "MARS_METEOR" || obs.type === "ROCKET_FRAGMENT") {
          // Craggy stone
          const stoneGrad = ctx.createRadialGradient(-2, -2, 2, 0, 0, obs.width * 0.5);
          const isMars = obs.type === "MARS_ROCK" || obs.type === "MARS_METEOR";
          stoneGrad.addColorStop(0, isMars ? "#ff8a65" : "#b0bec5");
          stoneGrad.addColorStop(0.6, isMars ? "#d84315" : "#546e7a");
          stoneGrad.addColorStop(1, isMars ? "#3e2723" : "#212121");
          
          ctx.fillStyle = stoneGrad;
          ctx.beginPath();
          const pts = 6;
          for (let i = 0; i < pts; i++) {
            const angle = (i / pts) * Math.PI * 2;
            const radiusFactor = 0.85 + (Math.sin(i * 1.7) * 0.12);
            const rx = Math.cos(angle) * (obs.width / 2) * radiusFactor;
            const ry = Math.sin(angle) * (obs.height / 2) * radiusFactor;
            if (i === 0) ctx.moveTo(rx, ry);
            else ctx.lineTo(rx, ry);
          }
          ctx.closePath();
          ctx.fill();

        } else if (obs.type === "SPACE_PROBE" || obs.type === "PROBE") {
          // Probe body: grey cylinder
          const probeGrad = ctx.createLinearGradient(-obs.width * 0.3, 0, obs.width * 0.3, 0);
          probeGrad.addColorStop(0, "#90a4ae");
          probeGrad.addColorStop(0.5, "#eceff1");
          probeGrad.addColorStop(1, "#455a64");
          ctx.fillStyle = probeGrad;
          
          // Hexagonal core
          ctx.beginPath();
          ctx.moveTo(-obs.width * 0.25, -obs.height * 0.25);
          ctx.lineTo(obs.width * 0.25, -obs.height * 0.25);
          ctx.lineTo(obs.width * 0.35, 0);
          ctx.lineTo(obs.width * 0.25, obs.height * 0.25);
          ctx.lineTo(-obs.width * 0.25, obs.height * 0.25);
          ctx.lineTo(-obs.width * 0.35, 0);
          ctx.closePath();
          ctx.fill();

          // Solar wings
          ctx.fillStyle = "#1e88e5";
          ctx.fillRect(-obs.width * 0.7, -obs.height * 0.08, obs.width * 0.35, obs.height * 0.16);
          ctx.fillRect(obs.width * 0.35, -obs.height * 0.08, obs.width * 0.35, obs.height * 0.16);

          // Antenna rod
          ctx.strokeStyle = "#cfd8dc";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, -obs.height * 0.25);
          ctx.lineTo(0, -obs.height * 0.55);
          ctx.stroke();

          // Flashing red indicator light
          ctx.fillStyle = Math.floor(timestamp / 350) % 2 === 0 ? "#ff1744" : "rgba(255, 23, 68, 0.2)";
          ctx.beginPath();
          ctx.arc(0, -obs.height * 0.55, 3.5, 0, Math.PI * 2);
          ctx.fill();

        } else {
          // Default fallbacks
          ctx.fillStyle = obs.color;
          ctx.fillRect(-obs.width / 2, -obs.height / 2, obs.width, obs.height);
        }

        ctx.restore();

        // --- COLLISION DETECTION (Obstacles vs Player Rocket) ---
        if (state.gameState === "PLAYING") {
          // Bounding box approximation (a slightly smaller box for fair hit detection)
          const marginW = obs.width * 0.15;
          const marginH = obs.height * 0.15;
          
          const rx = state.rocketX;
          const ry = state.rocketY;
          const rw = state.rocketWidth;
          const rh = state.rocketHeight;

          const collides = (
            obs.x + marginW < rx + rw &&
            obs.x + obs.width - marginW > rx &&
            obs.y + marginH < ry + rh &&
            obs.y + obs.height - marginH > ry
          );

          if (collides) {
            // Collision occurs!
            obs.active = false;
            
            // Spawn explosion particles
            spawnParticles(obs.x + obs.width / 2, obs.y + obs.height / 2, obs.color, 15, 1.2);
            state.screenShake = 18; // strong shake
            
            if (state.shieldDuration > 0) {
              // Protected by shield! Shield absorb sound
              soundManagerRef.current.playPowerUp();
            } else {
              // Lose a life
              state.lives -= 1;
              setLives(state.lives);
              soundManagerRef.current.playExplosion();

              // If splitting is possible, it splits on impact
              if (obs.canSplit) {
                triggerObstacleSplit(obs);
              }

              if (state.lives <= 0) {
                // Game Over sequence
                state.gameState = "GAMEOVER";
                setGameState("GAMEOVER");
                
                // Explode player rocket completely
                spawnParticles(state.rocketX + state.rocketWidth / 2, state.rocketY + state.rocketHeight / 2, "#ffd54f", 40, 2.0);
                spawnParticles(state.rocketX + state.rocketWidth / 2, state.rocketY + state.rocketHeight / 2, "#ff5722", 35, 1.5);
              }
            }
          }
        }
      });

      // --- POWER-UPS PHYSICS & RENDERING ---
      state.powerups.forEach((pu) => {
        if (!pu.active) return;

        // Move powerup down
        if (state.gameState === "PLAYING") {
          pu.y += pu.speed * obsSlowMult;

          if (pu.y > canvas.height) {
            pu.active = false;
            return;
          }
        }

        // Draw Power-up
        ctx.save();
        ctx.translate(pu.x + pu.width / 2, pu.y + pu.height / 2);
        
        // Spin powerup slowly
        const spin = timestamp * 0.003;
        ctx.rotate(spin);

        // Style based on type
        let color = "#00e5ff";
        let iconChar = "🛡️";
        switch (pu.type) {
          case "SHIELD":
            color = "#00e5ff"; iconChar = "🛡️";
            break;
          case "TIME_SLOW":
            color = "#ffeb3b"; iconChar = "⏱️";
            break;
          case "DOUBLE_POINTS":
            color = "#e040fb"; iconChar = "⭐";
            break;
          case "EXTRA_LIFE":
            color = "#ff1744"; iconChar = "❤️";
            break;
        }

        // Glowing circle outline
        ctx.shadowBlur = 12;
        ctx.shadowColor = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3.0;
        ctx.beginPath();
        ctx.arc(0, 0, pu.width / 2, 0, Math.PI * 2);
        ctx.stroke();

        // Draw inner glyph representation
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.font = "18px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(iconChar, 0, 0);

        ctx.restore();

        // --- COLLISION DETECTION (Power-up vs Player Rocket) ---
        if (state.gameState === "PLAYING") {
          const rx = state.rocketX;
          const ry = state.rocketY;
          const rw = state.rocketWidth;
          const rh = state.rocketHeight;

          const collides = (
            pu.x < rx + rw &&
            pu.x + pu.width > rx &&
            pu.y < ry + rh &&
            pu.y + pu.height > ry
          );

          if (collides) {
            pu.active = false;
            soundManagerRef.current.playPowerUp();
            spawnParticles(pu.x + pu.width / 2, pu.y + pu.height / 2, color, 20, 0.8);

            // Apply Power-up effect
            switch (pu.type) {
              case "SHIELD":
                state.shieldDuration = 5000; // 5 seconds
                setShieldTimeLeft(5);
                break;
              case "TIME_SLOW":
                state.slowDuration = 6000; // 6 seconds
                setSlowTimeLeft(6);
                soundManagerRef.current.setMusicPitchFactor(0.65); // reduce pitch of music
                break;
              case "DOUBLE_POINTS":
                state.doublePointsDuration = 8000; // 8 seconds
                setDoublePointsTimeLeft(8);
                break;
              case "EXTRA_LIFE":
                state.lives = Math.min(3, state.lives + 1);
                setLives(state.lives);
                break;
            }
          }
        }
      });

      // Draw screen flash overlay (brief bright lens flash on explosions/separation)
      if (state.screenFlash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${state.screenFlash})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (state.gameState === "PLAYING") {
          state.screenFlash -= dt * 3.0; // fade out in ~0.25s
        }
      }

      // Repeat animation frame if playing or paused or gameover
      if (state.gameState === "PLAYING" || state.gameState === "PAUSED" || state.gameState === "GAMEOVER" || state.gameState === "MENU") {
        animationId = requestAnimationFrame(gameLoop);
      }
    };

    animationId = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-screen overflow-hidden bg-slate-950 select-none text-slate-100 font-mono"
    >
      {/* CANVAS RENDERING CONTAINER */}
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-pointer touch-none"
      />

      {/* --- MENU OVERLAY --- */}
      {gameState === "MENU" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-slate-950/40 z-10 overflow-y-auto">
          <div className="text-center mb-5">
            <h1 className="text-4xl font-extrabold tracking-widest text-cyan-400 font-display drop-shadow-[0_0_12px_rgba(34,211,238,0.5)]">
              KOZMİK KAÇIŞ
            </h1>
            <p className="text-[10px] uppercase tracking-widest text-slate-400 mt-1 font-mono">
              Sonsuz Uzay Kaçış Macerası
            </p>
          </div>

          <div className="flex flex-col items-center gap-3.5 max-w-xs w-full mb-4">
            <div className="bg-slate-900/60 border border-slate-800 rounded-lg py-2 px-4 w-full text-center">
              <span className="text-[10px] text-slate-500 block uppercase tracking-wider">EN YÜKSEK SKOR</span>
              <span className="text-xl font-bold font-display text-yellow-400">{highScore}</span>
            </div>

            {/* TAB SELECTOR FOR SKINS */}
            <div className="flex w-full bg-slate-900 border border-slate-850 rounded-lg p-1">
              <button
                onClick={() => setActiveTab("pilots")}
                className={`flex-1 py-1.5 text-[10px] font-bold tracking-wider rounded font-display transition-all ${
                  activeTab === "pilots"
                    ? "bg-cyan-500 text-slate-950 shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                👩‍🚀 PİLOTLAR
              </button>
              <button
                onClick={() => setActiveTab("rockets")}
                className={`flex-1 py-1.5 text-[10px] font-bold tracking-wider rounded font-display transition-all ${
                  activeTab === "rockets"
                    ? "bg-cyan-500 text-slate-950 shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                🚀 ROKETLER
              </button>
            </div>

            {/* PILOTS TAB VIEW */}
            {activeTab === "pilots" && (
              <div className="grid grid-cols-5 gap-1.5 w-full bg-slate-900/40 p-2 rounded-lg border border-slate-800/60 max-h-[115px] overflow-y-auto">
                {PILOTS.map((pilot) => {
                  const isLocked = highScore < pilot.unlockScore;
                  const isSelected = selectedPilot === pilot.id;
                  return (
                    <button
                      key={pilot.id}
                      disabled={isLocked}
                      onClick={() => setSelectedPilot(pilot.id)}
                      className={`relative flex flex-col items-center justify-center p-1.5 rounded border transition-all ${
                        isSelected
                          ? "bg-cyan-500/15 border-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.35)]"
                          : isLocked
                          ? "bg-slate-950/50 border-slate-900 opacity-40 cursor-not-allowed"
                          : "bg-slate-950 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <span className="text-xl">{pilot.emoji}</span>
                      <span className="text-[7px] text-slate-400 mt-1 font-bold">
                        {pilot.unlockScore === 0 ? "Açık" : `${pilot.unlockScore}`}
                      </span>
                      {isLocked && (
                        <span className="absolute top-0 right-0 text-[7px] bg-red-600/80 text-slate-100 px-0.5 rounded-bl font-bold">🔒</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ROCKET SKINS TAB VIEW */}
            {activeTab === "rockets" && (
              <div className="grid grid-cols-5 gap-1.5 w-full bg-slate-900/40 p-2 rounded-lg border border-slate-800/60 max-h-[115px] overflow-y-auto">
                {ROCKET_SKINS.map((skin) => {
                  const isLocked = highScore < skin.unlockScore;
                  const isSelected = selectedRocket === skin.id;
                  return (
                    <button
                      key={skin.id}
                      disabled={isLocked}
                      onClick={() => setSelectedRocket(skin.id)}
                      className={`relative flex flex-col items-center justify-center p-1.5 rounded border transition-all ${
                        isSelected
                          ? "bg-cyan-500/15 border-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.35)]"
                          : isLocked
                          ? "bg-slate-950/50 border-slate-900 opacity-40 cursor-not-allowed"
                          : "bg-slate-950 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex gap-0.5 items-center justify-center w-5 h-4 mt-0.5">
                        <div className="w-1.5 h-3 rounded-t-full border border-slate-700/50 shadow-inner" style={{ backgroundColor: skin.primaryColor }} />
                      </div>
                      <span className="text-[7px] text-slate-400 mt-1 font-bold">
                        {skin.unlockScore === 0 ? "Açık" : `${skin.unlockScore}`}
                      </span>
                      {isLocked && (
                        <span className="absolute top-0 right-0 text-[7px] bg-red-600/80 text-slate-100 px-0.5 rounded-bl font-bold">🔒</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* DESCRIPTIONS */}
            <div className="text-[10px] text-center text-slate-400 bg-slate-950/50 py-1.5 px-3 rounded w-full border border-slate-900/60 font-mono min-h-[32px] flex items-center justify-center">
              {activeTab === "pilots" ? (
                (() => {
                  const p = PILOTS.find(pilot => pilot.id === selectedPilot);
                  if (!p) return null;
                  const locked = highScore < p.unlockScore;
                  return (
                    <span>
                      Pilot: <strong className="text-cyan-400">{p.name}</strong> 
                      {locked ? ` (🔒 ${p.unlockScore} Skor Gerekir)` : " (SEÇİLDİ)"}
                    </span>
                  );
                })()
              ) : (
                (() => {
                  const r = ROCKET_SKINS.find(skin => skin.id === selectedRocket);
                  if (!r) return null;
                  const locked = highScore < r.unlockScore;
                  return (
                    <span>
                      Model: <strong className="text-cyan-400">{r.name}</strong> ({r.colorName})
                      {locked ? ` (🔒 ${r.unlockScore} Skor Gerekir)` : " (SEÇİLDİ)"}
                    </span>
                  );
                })()
              )}
            </div>

            <button
              onClick={handleStartGame}
              className="flex items-center justify-center gap-3 w-full bg-cyan-500 hover:bg-cyan-400 active:scale-95 text-slate-950 font-bold py-3.5 px-6 rounded-lg text-md tracking-wider font-display transition-all shadow-[0_0_15px_rgba(6,182,212,0.35)] mt-1"
            >
              <Play className="w-5 h-5 fill-slate-950" />
              OYUNA BAŞLA
            </button>

            <div className="text-[9px] text-center text-slate-500 leading-relaxed mt-1">
              <p>📱 Mobil: Parmağınızla roketi sürükleyin.</p>
              <p>💻 PC: Yön tuşları veya A/D ile yön verin.</p>
            </div>
          </div>

          {/* Sound Controls in Menu */}
          <button
            onClick={() => setMuted(!muted)}
            className="absolute top-4 right-4 p-2 bg-slate-900/80 hover:bg-slate-800 rounded-full border border-slate-700 transition"
          >
            {muted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-cyan-400" />}
          </button>
        </div>
      )}

      {/* --- HUD (HEADS-UP DISPLAY) DURING GAMEPLAY --- */}
      {gameState === "PLAYING" && (
        <>
          {/* Pause / Sound Toggles Top Left */}
          <div className="absolute top-4 left-4 flex gap-2 z-10">
            <button
              onClick={handlePause}
              className="p-2 bg-slate-900/80 hover:bg-slate-800 active:scale-95 rounded-full border border-slate-800 text-slate-200 transition"
            >
              <Pause className="w-5 h-5" />
            </button>
            <button
              onClick={() => setMuted(!muted)}
              className="p-2 bg-slate-900/80 hover:bg-slate-800 active:scale-95 rounded-full border border-slate-800 text-slate-200 transition"
            >
              {muted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-cyan-400" />}
            </button>
          </div>

          {/* TOP CENTER: Score board */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none z-10">
            <span className="text-[10px] tracking-widest text-slate-400 uppercase">SKOR</span>
            <span className="text-4xl font-extrabold font-display text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]">
              {score}
            </span>
            <span className="text-[10px] tracking-wide text-indigo-300 mt-1 uppercase font-bold px-2 py-0.5 rounded bg-indigo-950/60 border border-indigo-900/30">
              BÖLGE: {ZONES[activeZoneIndex].name}
            </span>
          </div>

          {/* TOP RIGHT: Health / Lives */}
          <div className="absolute top-4 right-4 flex gap-1 z-10 bg-slate-900/50 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-800/50">
            {Array.from({ length: 3 }).map((_, idx) => (
              <Heart
                key={idx}
                className={`w-5 h-5 transition-transform ${
                  idx < lives
                    ? "fill-red-500 text-red-500 scale-100"
                    : "fill-transparent text-slate-600 scale-90"
                }`}
              />
            ))}
          </div>

          {/* BOTTOM LEFT: Power-up duration indicators */}
          <div className="absolute bottom-4 left-4 flex flex-col gap-2 max-w-[180px] w-full z-10 pointer-events-none">
            {/* Shield Indicator */}
            {shieldTimeLeft > 0 && (
              <div className="flex flex-col bg-cyan-950/60 border border-cyan-800/40 rounded px-2.5 py-1.5 text-xs text-cyan-300">
                <div className="flex items-center justify-between font-bold mb-0.5">
                  <span className="flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5 fill-cyan-400 text-cyan-400" />
                    KALKAN
                  </span>
                  <span>{shieldTimeLeft}s</span>
                </div>
                <div className="w-full h-1 bg-cyan-950 rounded overflow-hidden">
                  <div
                    className="h-full bg-cyan-400 transition-all duration-1000"
                    style={{ width: `${(shieldTimeLeft / 5) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Time Slow Indicator */}
            {slowTimeLeft > 0 && (
              <div className="flex flex-col bg-yellow-950/60 border border-yellow-800/40 rounded px-2.5 py-1.5 text-xs text-yellow-300">
                <div className="flex items-center justify-between font-bold mb-0.5">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-yellow-400" />
                    ZAMAN YAVAŞLADI
                  </span>
                  <span>{slowTimeLeft}s</span>
                </div>
                <div className="w-full h-1 bg-yellow-950 rounded overflow-hidden">
                  <div
                    className="h-full bg-yellow-400 transition-all duration-1000"
                    style={{ width: `${(slowTimeLeft / 6) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Double Points Indicator */}
            {doublePointsTimeLeft > 0 && (
              <div className="flex flex-col bg-purple-950/60 border border-purple-800/40 rounded px-2.5 py-1.5 text-xs text-purple-300">
                <div className="flex items-center justify-between font-bold mb-0.5">
                  <span className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-purple-400 text-purple-400" />
                    2X SKOR KATLAYICI
                  </span>
                  <span>{doublePointsTimeLeft}s</span>
                </div>
                <div className="w-full h-1 bg-purple-950 rounded overflow-hidden">
                  <div
                    className="h-full bg-purple-400 transition-all duration-1000"
                    style={{ width: `${(doublePointsTimeLeft / 8) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* --- PAUSE OVERLAY --- */}
      {gameState === "PAUSED" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-slate-950/90 backdrop-blur-md z-15">
          <h2 className="text-3xl font-bold font-display text-cyan-400 tracking-wider mb-6">
            OYUN DURAKLATILDI
          </h2>

          <div className="flex flex-col gap-4 max-w-xs w-full">
            <button
              onClick={handlePause}
              className="flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-3.5 px-6 rounded-lg transition-all"
            >
              <Play className="w-5 h-5 fill-slate-950" />
              DEVAM ET
            </button>
            <button
              onClick={handleStartGame}
              className="flex items-center justify-center gap-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-cyan-400 font-bold py-3.5 px-6 rounded-lg transition-all"
            >
              <RotateCcw className="w-5 h-5" />
              YENİDEN BAŞLA
            </button>
            <button
              onClick={handleQuitToMenu}
              className="flex items-center justify-center gap-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 py-3 px-6 rounded-lg transition-all text-sm"
            >
              <Home className="w-4 h-4" />
              ANA MENÜYE DÖN
            </button>
          </div>
        </div>
      )}

      {/* --- ZONE TRANSITION BANNER OVERLAY --- */}
      {showTransition && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="bg-slate-950/80 border-y border-cyan-500/40 w-full py-6 text-center backdrop-blur-sm shadow-[0_0_30px_rgba(6,182,212,0.15)]">
            <h2 className="text-2xl sm:text-3xl font-extrabold font-display tracking-widest text-cyan-300 uppercase drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">
              {transitionText}
            </h2>
          </div>
        </div>
      )}

      {/* --- GAME OVER OVERLAY --- */}
      {gameState === "GAMEOVER" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-slate-950/92 backdrop-blur-md z-15">
          <div className="text-center mb-6">
            <h2 className="text-4xl font-extrabold font-display text-red-500 tracking-wider drop-shadow-[0_0_12px_rgba(239,68,68,0.4)]">
              GÖREV BAŞARISIZ
            </h2>
            <p className="text-xs uppercase tracking-widest text-slate-500 mt-2">
              Roketiniz çarpışma sonucu parçalandı.
            </p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 w-full max-w-sm flex flex-col gap-4 mb-6 text-center shadow-[0_0_20px_rgba(0,0,0,0.5)]">
            <div>
              <span className="text-xs text-slate-500 uppercase tracking-wider block">SON SKOR</span>
              <span className="text-3xl font-bold font-display text-cyan-400">{score}</span>
            </div>

            {score >= highScore && score > 0 ? (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded py-1 px-3 mt-1">
                <span className="text-xs text-yellow-400 font-bold font-display tracking-wider">
                  🎉 YENİ EN YÜKSEK SKOR! 🎉
                </span>
              </div>
            ) : (
              <div>
                <span className="text-xs text-slate-500 uppercase tracking-wider block">EN YÜKSEK SKOR</span>
                <span className="text-xl font-bold font-display text-slate-300">{highScore}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3.5 max-w-xs w-full">
            {/* WATCH AD TO CONTINUE BUTTON */}
            {!adContinueUsed && (
              <button
                onClick={handleAdContinue}
                className="relative flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 active:scale-95 text-white font-bold py-4 px-6 rounded-lg text-md tracking-wider font-display transition-all shadow-[0_0_20px_rgba(34,197,94,0.4)] animate-pulse"
              >
                <Tv className="w-5 h-5" />
                <span className="flex flex-col items-start">
                  <span className="text-sm">DEVAM ET</span>
                  <span className="text-[9px] font-normal tracking-wide opacity-80">📺 Reklam İzle & Devam Et</span>
                </span>
              </button>
            )}

            <button
              onClick={handleStartGame}
              className="flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-400 active:scale-95 text-slate-950 font-bold py-3.5 px-6 rounded-lg text-md tracking-wider font-display transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)]"
            >
              <RotateCcw className="w-5 h-5" />
              TEKRAR OYNA
            </button>
            <button
              onClick={handleQuitToMenu}
              className="flex items-center justify-center gap-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 py-3 px-6 rounded-lg transition-all text-sm"
            >
              <Home className="w-4 h-4" />
              ANA MENÜ
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
