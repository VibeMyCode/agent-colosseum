import { NetworkSelector } from "@/components/NetworkSelector";
import { WalletButton } from "@/components/WalletModal";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b hairline bg-void/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-3 px-4 py-3.5 lg:px-8">
        <div className="flex items-center gap-4">
          <a href="#top" className="group flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-ember-400 to-ember-600 text-void shadow-glow transition-transform group-hover:scale-105">
              <span className="text-base leading-none">⚔</span>
            </span>
            <span className="display text-base font-bold tracking-tight">
              <span className="text-gradient-ember">AGENT</span>
              <span className="text-zinc-200"> COLOSSEUM</span>
            </span>
          </a>
          <div className="hidden sm:block">
            <NetworkSelector />
          </div>
        </div>

        <WalletButton />
      </div>
      <div className="border-t hairline px-4 py-2 sm:hidden">
        <NetworkSelector />
      </div>
    </header>
  );
}
