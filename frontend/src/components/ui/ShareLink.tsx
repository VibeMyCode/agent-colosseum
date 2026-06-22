import { useCallback, useState } from "react";
import { Copy, Check, LinkSimple } from "@phosphor-icons/react";

type Props = {
  /** The full string copied to the clipboard. */
  value: string;
  /** Short label shown on the chip (defaults to a truncated value). */
  label?: string;
  className?: string;
};

export function ShareLink({ value, label, className = "" }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(value).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      });
    },
    [value]
  );

  return (
    <button
      onClick={copy}
      title={value}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-plasma-500/25 bg-plasma-500/10 px-2.5 py-1 font-mono text-[11px] text-plasma-200 transition-colors hover:border-plasma-400/40 ${className}`}
    >
      <LinkSimple size={12} weight="bold" className="shrink-0" />
      <span className="truncate">{label ?? value}</span>
      {copied ? (
        <Check size={12} weight="bold" className="shrink-0 text-emerald-400" />
      ) : (
        <Copy size={12} weight="duotone" className="shrink-0 text-plasma-300/70" />
      )}
    </button>
  );
}
