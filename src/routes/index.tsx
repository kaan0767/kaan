import { createFileRoute } from "@tanstack/react-router";
import { StickFightGame } from "@/game/StickFightGame";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NEON STRIKE — Stickman Fight" },
      { name: "description", content: "A neon 2D physics stickman fighter with bullet time, weapons, and chaotic local multiplayer." },
      { property: "og:title", content: "NEON STRIKE — Stickman Fight" },
      { property: "og:description", content: "Neon stickman combat. Bullet time. Local 2-player chaos." },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=JetBrains+Mono:wght@400;700&display=swap" },
    ],
  }),
  component: Index,
});

function Index() {
  return <StickFightGame />;
}
