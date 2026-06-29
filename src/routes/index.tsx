import { createFileRoute } from "@tanstack/react-router";
import { SpaceDodgeGame } from "@/game/SpaceDodgeGame";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KOZMİK KAÇIŞ — Space Rocket Dodge" },
      { name: "description", content: "Mobil cihazlar için optimize edilmiş, akıcı, tematik ve eğlenceli sonsuz uzay kaçış (Endless Dodging) oyunu." },
      { property: "og:title", content: "KOZMİK KAÇIŞ — Space Rocket Dodge" },
      { property: "og:description", content: "Dünya'dan derin uzaya uzanan sonsuz roket kaçış serüveni." },
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
  return <SpaceDodgeGame />;
}

