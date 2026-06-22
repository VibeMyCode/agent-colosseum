import { useCallback, useState } from "react";
import { useSails } from "@/hooks/use-sails";
import { useWallet } from "@/providers/chain-provider";
import { useToast } from "@/providers/toast-provider";
import { useColosseum } from "@/providers/colosseum-provider";

/* eslint-disable @typescript-eslint/no-explicit-any */

type SignArgs = { account: string; signer: unknown };

type RunOptions<T> = {
  /** Toast title while the tx is in flight. */
  pending: string;
  /** Toast title on success. */
  success: string;
  /** Optional message builder from the decoded response. */
  successMessage?: (result: T) => string;
  /** The actual contract call. */
  action: (sails: any, signArgs: SignArgs) => Promise<T>;
};

/** Map raw chain/panic errors to something a human can read. */
function humanizeError(err: unknown): string {
  let msg = err instanceof Error ? err.message : String(err);
  // Surface the panic reason the contract emitted (e.g. "InvalidStake").
  const panic = msg.match(/[Pp]anic(?:ked)?[^:]*:\s*'?([^'\n]+)'?/);
  if (panic) msg = panic[1];
  msg = msg.replace(/^Execution error:\s*/i, "").trim();
  if (/cancelled|rejected|user denied/i.test(msg)) return "Cancelled in wallet.";
  return msg.length > 160 ? msg.slice(0, 157) + "…" : msg;
}

export function useTx() {
  const { sails } = useSails();
  const { account, signer } = useWallet();
  const { push, update } = useToast();
  const { refresh } = useColosseum();
  const [busy, setBusy] = useState(false);

  const ready = Boolean(sails && account);

  const run = useCallback(
    async <T,>(opts: RunOptions<T>): Promise<T | null> => {
      if (!sails || !account) {
        push({
          kind: "error",
          title: "Wallet not connected",
          message: "Connect a wallet to act in the arena.",
        });
        return null;
      }
      const toastId = push({ kind: "pending", title: opts.pending });
      setBusy(true);
      try {
        const result = await opts.action(sails, {
          account: account.address,
          signer,
        });
        update(toastId, {
          kind: "success",
          title: opts.success,
          message: opts.successMessage?.(result),
        });
        refresh();
        return result;
      } catch (err) {
        update(toastId, {
          kind: "error",
          title: "Transaction failed",
          message: humanizeError(err),
        });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [sails, account, signer, push, update, refresh]
  );

  return { run, busy, ready };
}
