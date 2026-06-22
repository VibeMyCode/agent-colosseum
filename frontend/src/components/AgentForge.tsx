import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Trophy, Coins, Lightning, Sparkle } from "@phosphor-icons/react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { BodyPartsPicker } from "@/components/BodyPartsPicker";
import { useColosseum } from "@/providers/colosseum-provider";
import { useWallet } from "@/providers/chain-provider";
import { useTx } from "@/hooks/use-tx";
import {
  deriveStrategyHash,
  formatVara,
  hashToHex,
  registerAgent,
  shortHex,
  updateAgent,
  type BodyParts,
} from "@/lib/colosseum";

const DEFAULT_PARTS: BodyParts = {
  head_type: 0,
  body_type: 1,
  arms_type: 0,
  legs_type: 2,
};

export function AgentForge() {
  const { myAgent, ready } = useColosseum();
  const { account } = useWallet();
  const { run, busy } = useTx();

  const isUpdate = Boolean(myAgent);

  const [name, setName] = useState("");
  const [strategyUrl, setStrategyUrl] = useState("");
  const [parts, setParts] = useState<BodyParts>(DEFAULT_PARTS);
  const [strategyHash, setStrategyHash] = useState<number[]>([]);

  // Sync the form with the on-chain agent when it loads / account changes.
  useEffect(() => {
    if (myAgent) {
      setName(myAgent.name);
      setParts(myAgent.bodyParts);
    } else {
      setName("");
      setStrategyUrl("");
      setParts(DEFAULT_PARTS);
    }
  }, [myAgent, account?.address]);

  // Re-derive the strategy hash whenever the inputs change.
  useEffect(() => {
    let cancelled = false;
    deriveStrategyHash(`${name}::${strategyUrl}`).then((h) => {
      if (!cancelled) setStrategyHash(h);
    });
    return () => {
      cancelled = true;
    };
  }, [name, strategyUrl]);

  const nameError = useMemo(() => {
    if (name.length === 0) return "Required";
    if (name.length > 64) return "Max 64 characters";
    return null;
  }, [name]);

  const canSubmit = ready && Boolean(account) && !nameError && !busy;

  async function submit() {
    if (!canSubmit) return;
    if (isUpdate) {
      await run({
        pending: "Recalibrating agent…",
        success: "Agent updated",
        action: (sails, signArgs) =>
          updateAgent(sails, signArgs, {
            name,
            bodyParts: parts,
            strategyHash,
            strategyUrl: strategyUrl || "",
          }),
      });
    } else {
      await run({
        pending: "Forging agent…",
        success: "Agent forged",
        successMessage: () => `${name} has entered the colosseum.`,
        action: (sails, signArgs) =>
          registerAgent(sails, signArgs, {
            name,
            bodyParts: parts,
            strategyHash,
            strategyUrl: strategyUrl || "",
          }),
      });
    }
  }

  return (
    <section className="glass overflow-hidden">
      <div className="flex items-center gap-2.5 border-b hairline px-5 py-4">
        <Sparkle size={18} weight="fill" className="text-ember-400" />
        <h2 className="display text-base font-bold text-zinc-100">
          {isUpdate ? "Your Agent" : "Forge Your Agent"}
        </h2>
        {isUpdate && (
          <span className="chip ml-auto border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
            Registered
          </span>
        )}
      </div>

      <div className="grid gap-6 p-5 sm:grid-cols-[160px_1fr]">
        {/* Live preview */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative flex h-44 w-full items-center justify-center rounded-2xl border hairline bg-grid-arena [background-size:16px_16px]">
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-ember-radial" />
            <motion.div
              key={`${parts.head_type}-${parts.body_type}-${parts.arms_type}-${parts.legs_type}`}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
            >
              <AgentAvatar parts={parts} size={108} animated />
            </motion.div>
          </div>

          {isUpdate && myAgent && (
            <div className="grid w-full grid-cols-3 gap-1.5 text-center">
              <Stat icon={<Trophy size={13} weight="fill" />} label="Wins" value={myAgent.wins} />
              <Stat icon={<Lightning size={13} weight="fill" />} label="Losses" value={myAgent.losses} />
              <Stat
                icon={<Coins size={13} weight="fill" />}
                label="Earned"
                value={formatVara(myAgent.totalEarned)}
              />
            </div>
          )}
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block font-mono text-xs text-zinc-500">
              Callsign
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. NEON_REAPER"
              maxLength={80}
              className="field"
            />
            <div className="mt-1 flex justify-between text-[11px]">
              <span className="text-red-400">{nameError && name.length > 0 ? nameError : ""}</span>
              <span className="text-zinc-600">{name.length}/64</span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block font-mono text-xs text-zinc-500">
              Strategy URL <span className="text-zinc-700">· optional</span>
            </label>
            <input
              value={strategyUrl}
              onChange={(e) => setStrategyUrl(e.target.value)}
              placeholder="ipfs://… or https://…"
              className="field"
            />
            {strategyHash.length > 0 && (
              <p className="mt-1 font-mono text-[11px] text-zinc-600">
                hash {shortHex(hashToHex(strategyHash), 10, 8)}
              </p>
            )}
          </div>

          <BodyPartsPicker value={parts} onChange={setParts} />

          <button onClick={submit} disabled={!canSubmit} className="btn-ember w-full">
            {busy
              ? "Working…"
              : !account
                ? "Connect wallet to forge"
                : isUpdate
                  ? "Update Agent"
                  : "Forge Agent"}
          </button>
        </div>
      </div>
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border hairline bg-white/[0.02] px-1.5 py-2">
      <div className="flex items-center justify-center gap-1 text-ember-400">
        {icon}
      </div>
      <div className="mt-0.5 font-display text-sm font-bold text-zinc-100">
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-600">
        {label}
      </div>
    </div>
  );
}
