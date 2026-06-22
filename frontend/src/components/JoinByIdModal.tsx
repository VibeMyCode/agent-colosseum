import { useState } from "react";
import { MagnifyingGlass, Warning, SignIn } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/Modal";
import { useColosseum } from "@/providers/colosseum-provider";
import { parseMatchRef } from "@/lib/share";
import { formatVara } from "@/lib/colosseum";

export function JoinByIdModal({
  open,
  onClose,
  onFound,
}: {
  open: boolean;
  onClose: () => void;
  onFound: (matchId: number) => void;
}) {
  const { matches } = useColosseum();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function close() {
    setInput("");
    setError(null);
    onClose();
  }

  function lookup() {
    setError(null);
    const ref = parseMatchRef(input);
    if (!ref) {
      setError("Paste a match link or ID.");
      return;
    }
    const match = matches.find((m) => m.id === ref.matchId);
    if (!match) {
      setError(`No match #${ref.matchId} on this contract.`);
      return;
    }
    if (match.status !== "Waiting") {
      setError(`Match #${ref.matchId} is already ${match.status.toLowerCase()}.`);
      return;
    }
    onFound(match.id);
    close();
  }

  const preview = (() => {
    const ref = parseMatchRef(input);
    if (!ref) return null;
    return matches.find((m) => m.id === ref.matchId) ?? null;
  })();

  return (
    <Modal
      open={open}
      onClose={close}
      title="Join by Invite"
      subtitle="Paste a private match link or its ID to step in."
    >
      <div className="space-y-4">
        <div>
          <div className="relative">
            <MagnifyingGlass
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600"
            />
            <input
              autoFocus
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && lookup()}
              placeholder="colosseum.ai/match/0x…/12  or  12"
              className="field pl-10 font-mono text-sm"
            />
          </div>
          {error && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-red-300">
              <Warning size={13} weight="fill" /> {error}
            </p>
          )}
        </div>

        {preview && preview.status === "Waiting" && (
          <div className="flex items-center justify-between rounded-xl border border-ember-500/20 bg-ember-500/[0.06] px-4 py-3 text-sm">
            <span className="text-zinc-300">
              Match #{preview.id} ·{" "}
              <span className="text-zinc-500">{preview.agentAName || "Agent A"}</span>
            </span>
            <span className="font-display font-bold text-ember-200">
              {formatVara(preview.stake)} VARA
            </span>
          </div>
        )}

        <button onClick={lookup} disabled={!input.trim()} className="btn-ember w-full !py-3">
          <SignIn size={18} weight="bold" /> Find Match
        </button>
      </div>
    </Modal>
  );
}
