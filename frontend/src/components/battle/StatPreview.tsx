/**
 * Compact readout of the combat stats a chassis resolves to. Shared by the
 * agent forge (loadout preview) and the bot-sparring setup screen.
 */
import { Heart, Shield, Crosshair, Lightning } from "@phosphor-icons/react";
import { deriveStats } from "@/lib/battle";
import type { BodyParts } from "@/lib/colosseum";

const WEAPON_LABEL: Record<string, string> = {
  blades: "Blades",
  cannons: "Cannons",
  grapnels: "Grapnels",
};

export function StatPreview({
  parts,
  className = "",
}: {
  parts: BodyParts;
  className?: string;
}) {
  const s = deriveStats(parts);
  return (
    <div className={`grid grid-cols-2 gap-1.5 ${className}`}>
      <Chip
        icon={<Heart size={12} weight="fill" className="text-rose-400" />}
        label="Health"
        value={`${s.maxHp} HP`}
      />
      <Chip
        icon={<Shield size={12} weight="fill" className="text-cyan-300" />}
        label="Dodge"
        value={`${s.dodgeCharges}x`}
      />
      <Chip
        icon={<Crosshair size={12} weight="fill" className="text-ember-400" />}
        label={WEAPON_LABEL[s.weapon] ?? "Weapon"}
        value={`${s.hitDamage} dmg`}
      />
      <Chip
        icon={<Lightning size={12} weight="fill" className="text-amber-400" />}
        label="Boost"
        value={`${s.boostCharges}x ×${s.boostMultiplier.toFixed(1)}`}
      />
    </div>
  );
}

function Chip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border hairline bg-white/[0.02] px-2 py-1.5">
      {icon}
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[10px] uppercase tracking-wider text-zinc-600">
          {label}
        </div>
        <div className="font-display text-xs font-bold text-zinc-200">{value}</div>
      </div>
    </div>
  );
}
