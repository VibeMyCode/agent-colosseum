import { useMemo, useState } from "react";
import { Sword, Warning } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/Modal";
import { useColosseum } from "@/providers/colosseum-provider";
import { useWallet } from "@/providers/chain-provider";
import { useTx } from "@/hooks/use-tx";
import {
  createMatch,
  formatVara,
  MAX_STAKE,
  MIN_STAKE,
  varaToUnits,
} from "@/lib/colosseum";

const PRESETS = ["10", "25", "100", "500"];

export function CreateMatchModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { myAgent, config } = useColosseum();
  const { account, balance } = useWallet();
  const { run, busy } = useTx();
  const [amount, setAmount] = useState("25");

  const units = useMemo(() => {
    try {
      return varaToUnits(amount);
    } catch {
      return 0n;
    }
  }, [amount]);

  const error = useMemo(() => {
    if (!account) return "Connect a wallet first.";
    if (!myAgent) return "Forge an agent before opening a match.";
    if (config?.paused) return "The arena is paused by the operator.";
    if (units < MIN_STAKE)
      return `Minimum stake is ${formatVara(MIN_STAKE)} VARA.`;
    if (units > MAX_STAKE)
      return `Maximum stake is ${formatVara(MAX_STAKE)} VARA.`;
    return null;
  }, [account, myAgent, config, units]);

  async function submit() {
    if (error || busy) return;
    const res = await run({
      pending: "Opening match…",
      success: "Match opened",
      successMessage: (id) => `Match #${id} is waiting for a challenger.`,
      action: (sails, signArgs) => createMatch(sails, signArgs, units),
    });
    if (res !== null) onClose();
  }

  const fee = config ? (units * 2n * BigInt(config.feeBps)) / 10_000n : 0n;
  const pool = units * 2n - fee;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Open a Match"
      subtitle="Stake VARA and wait for a challenger to match it."
    >
      <div className="space-y-5">
        <div>
          <label className="mb-2 block font-mono text-xs text-zinc-500">
            Your stake (VARA)
          </label>
          <div className="relative">
            <input
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value.replace(/[^0-9.]/g, ""))
              }
              inputMode="decimal"
              className="field !py-3.5 pr-16 font-display text-2xl font-bold"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 font-display text-sm text-zinc-500">
              VARA
            </span>
          </div>
          <div className="mt-2 flex gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setAmount(p)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                  amount === p
                    ? "border-ember-500/50 bg-ember-500/10 text-ember-200"
                    : "border-white/8 text-zinc-400 hover:border-white/20"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          {balance !== null && (
            <p className="mt-2 text-right text-[11px] text-zinc-600">
              Balance: {balance} VARA
            </p>
          )}
        </div>

        {/* Payout preview */}
        <div className="space-y-2 rounded-xl border hairline bg-white/[0.02] p-4 text-sm">
          <Row label="Total pool (both stakes)" value={`${formatVara(units * 2n)} VARA`} />
          <Row
            label={`Protocol fee (${((config?.feeBps ?? 200) / 100).toFixed(2)}%)`}
            value={`− ${formatVara(fee)} VARA`}
            muted
          />
          <div className="border-t hairline pt-2">
            <Row
              label="Winner takes"
              value={`${formatVara(pool)} VARA`}
              highlight
            />
          </div>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
            <Warning size={15} weight="fill" className="shrink-0" />
            {error}
          </div>
        ) : null}

        <button onClick={submit} disabled={Boolean(error) || busy} className="btn-ember w-full !py-3">
          <Sword size={18} weight="fill" />
          {busy ? "Opening…" : `Stake ${amount || "0"} VARA`}
        </button>
      </div>
    </Modal>
  );
}

function Row({
  label,
  value,
  muted,
  highlight,
}: {
  label: string;
  value: string;
  muted?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-zinc-500" : "text-zinc-400"}>{label}</span>
      <span
        className={
          highlight
            ? "font-display text-base font-bold text-gradient-ember"
            : muted
              ? "font-mono text-zinc-500"
              : "font-mono text-zinc-200"
        }
      >
        {value}
      </span>
    </div>
  );
}
