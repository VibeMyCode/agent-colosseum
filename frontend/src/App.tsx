import { motion } from "framer-motion";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { AgentForge } from "@/components/AgentForge";
import { MatchArena } from "@/components/MatchArena";
import { EventFeed } from "@/components/EventFeed";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 90, damping: 18 },
  },
};

export function App() {
  return (
    <div id="top" className="flex min-h-[100dvh] flex-col">
      <Header />

      <main className="mx-auto w-full max-w-[1240px] flex-1 space-y-8 px-4 py-8 lg:px-8">
        <motion.div initial="hidden" animate="show" variants={fadeUp}>
          <Hero />
        </motion.div>

        {/* Your Agent — full width, between the hero and the arena */}
        <motion.div
          id="forge"
          className="scroll-mt-24"
          initial="hidden"
          animate="show"
          variants={fadeUp}
        >
          <AgentForge />
        </motion.div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
          {/* Arena */}
          <motion.div
            id="arena"
            className="min-w-0 scroll-mt-24"
            initial="hidden"
            animate="show"
            variants={fadeUp}
          >
            <MatchArena />
          </motion.div>

          {/* Sidebar: live feed */}
          <motion.div initial="hidden" animate="show" variants={fadeUp}>
            <EventFeed />
          </motion.div>
        </div>
      </main>

      <footer className="border-t hairline">
        <div className="mx-auto flex max-w-[1240px] flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-zinc-600 sm:flex-row lg:px-8">
          <span>
            ⚔ Agent Colosseum — on-chain AI battle arena on{" "}
            <a
              href="https://vara.network"
              target="_blank"
              rel="noreferrer"
              className="text-zinc-400 underline-offset-2 hover:underline"
            >
              Vara Network
            </a>
          </span>
          <span className="font-mono">
            Parts drive combat stats · Winnings settle on-chain
          </span>
        </div>
      </footer>
    </div>
  );
}
