import { useState, useCallback } from "react";
import { Copy, Check } from "@phosphor-icons/react";
import { toVaraAddress } from "@/lib/wallet";

type Props = {
  address: string;
  className?: string;
};

export function CopyAddress({ address, className = "" }: Props) {
  const [copied, setCopied] = useState(false);
  const varaAddr = toVaraAddress(address);
  const short =
    varaAddr.length > 16
      ? `${varaAddr.slice(0, 8)}...${varaAddr.slice(-6)}`
      : varaAddr;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(varaAddr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [varaAddr]);

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 font-mono text-zinc-300 hover:text-zinc-100 transition-colors ${className}`}
      title={varaAddr}
    >
      {short}
      {copied ? (
        <Check size={13} weight="bold" className="text-emerald-400" />
      ) : (
        <Copy size={13} weight="duotone" className="text-zinc-500" />
      )}
    </button>
  );
}
