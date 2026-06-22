import { useEffect, useMemo, useState } from "react";
import { Sword, Warning, LockKey, CheckCircle } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/Modal";
import { ShareLink } from "@/components/ui/ShareLink";
import { useColosseum } from "@/providers/colosseum-provider";
import { useChainApi, useWallet } from "@/providers/chain-provider";
import { useTx } from "@/hooks/use-tx";
import {
  createMatch,
  formatVara,
  MAX_STAKE,
  MIN_STAKE,
  varaToUnits,
} from "@/lib/colosseum";
import { buildMatchLink, markPrivate } from "@/lib/share";

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
  const { programId } = useChainApi();
  const { run, busy } = useTx();
  const [amount, setAmount] = useState("25");
  const [priv, setPriv] = useState(false);
  const [createdId, setCreatedId] = useState<number | null>(null);

  // Reset the post-create share view each time the modal opens.
  useEffect(() => {
    if (open) setCreatedId(null);
  }, [open]);

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
    const id = await run<number>({
      pending: "Opening match…",
      success: priv ? "Private match opened" : "Match opened",
      successMessage: (mid) =>
        priv
          ? `Match #${mid} — share the invite to let a friend join.`
          : `Match #${mid} is waiting for a challenger.`,
      action: (sails, signArgs) => createMatch(sails, signArgs, units),
    });
    if (id !== null) {
      if (priv) {
        markPrivate(programId, id);
        setCreatedId(id);
      } else {
        onClose();
      }
    }
  }

  const fee = config ? (units * 2n * BigInt(config.feeBps)) / 10_000n : 0n;
  const pool = units * 2n - fee;
  const link =
    createdId !== null ? buildMatchLink(programId, createdId) : "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={createdId !== null ? "Private Match Ready" : "Open a Match"}
      subtitle={
        createdId !== null
          ? "Send the invite to your challenger — only someone with the link will know to join."
          : "Stake VARA and wait for a challenger to match it."
      }
    >
      {createdId !== null ? (
        <div className="space-y-5">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-5 py-6 text-center">
            <CheckCircle size={34} weight="fill" className="text-emerald-400" />
            <div>
              <p className="font-display text-lg font-bold text-zinc-100">
                Match #{createdId} is live
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                Staked {formatVara(units)} VARA · winner takes {formatVara(pool)}.
              </p>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block font-mono text-xs text-zinc-500">
              Invite link
            </label>
            <ShareLink value={link} label={link.replace(/^https?:\/\//, "")} className="w-full !text-xs" />
            <p className="mt-2 text-[11px] text-zinc-600">
              Your friend can paste this (or just the number{" "}
              <span className="font-mono text-zinc-500">{createdId}</span>) into
              “Join by Invite”.
            </p>
          </div>

          <button onClick={onClose} className="btn-ember w-full !py-3">
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <label className="mb-2 block font-mono text-xs text-zinc-500">
              Your stake (VARA)
            </label>
            <div className="relative">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
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

          {/* Private toggle */}
          <button
            type="button"
            onClick={() => setPriv((v) => !v)}
            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
              priv
                ? "border-plasma-500/40 bg-plasma-500/[0.08]"
                : "border-white/8 bg-white/[0.02] hover:border-white/15"
            }`}
          >
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                priv ? "bg-plasma-500/20 text-plasma-300" : "bg-white/5 text-zinc-500"
              }`}
            >
              <LockKey size={18} weight="fill" />
            </span>
            <span className="flex-1">
              <span className="block font-display text-sm font-semibold text-zinc-200">
                Private match
              </span>
              <span className="block text-xs text-zinc-500">
                Hidden by an invite link — share it with a friend to play.
              </span>
            </span>
            <span
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                priv ? "bg-plasma-500" : "bg-white/10"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  priv ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>

          {/* Payout preview */}
          <div className="space-y-2 rounded-xl border hairline bg-white/[0.02] p-4 text-sm">
            <Row label="Total pool (both stakes)" value={`${formatVara(units * 2n)} VARA`} />
            <Row
              label={`Protocol fee (${((config?.feeBps ?? 200) / 100).toFixed(2)}%)`}
              value={`− ${formatVara(fee)} VARA`}
              muted
            />
            <div className="border-t hairline pt-2">
              <Row label="Winner takes" value={`${formatVara(pool)} VARA`} highlight />
            </div>
          </div>

          {error ? (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
              <Warning size={15} weight="fill" className="shrink-0" />
              {error}
            </div>
          ) : null}

          <button onClick={submit} disabled={Boolean(error) || busy} className="btn-ember w-full !py-3">
            {priv ? <LockKey size={18} weight="fill" /> : <Sword size={18} weight="fill" />}
            {busy
              ? "Opening…"
              : `${priv ? "Open Private" : "Stake"} ${amount || "0"} VARA`}
          </button>
        </div>
      )}
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
