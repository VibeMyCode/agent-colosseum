import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSails } from "@/hooks/use-sails";
import { useChainApi, useWallet } from "@/providers/chain-provider";
import { useEvents } from "@/providers/events-provider";
import {
  addressToActorId,
  fetchAgents,
  fetchConfig,
  fetchMatches,
  type Agent,
  type Config,
  type Match,
} from "@/lib/colosseum";

const PROGRAM_ID_RE = /^0x[0-9a-fA-F]{64}$/;
const POLL_MS = 8000;

type ColosseumState = {
  ready: boolean;
  loading: boolean;
  error: string | null;
  matches: Match[];
  activeMatches: Match[];
  agents: Agent[];
  config: Config | null;
  myActorId: string | null;
  myAgent: Agent | null;
  refresh: () => void;
};

const Ctx = createContext<ColosseumState | null>(null);

export function ColosseumProvider({ children }: { children: ReactNode }) {
  const { sails, loading: sailsLoading } = useSails();
  const { programId, apiStatus } = useChainApi();
  const { account } = useWallet();
  const { events } = useEvents();

  const [matches, setMatches] = useState<Match[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const hasProgram = PROGRAM_ID_RE.test(programId || "");
  const ready =
    Boolean(sails) && !sailsLoading && apiStatus === "ready" && hasProgram;

  const myActorId = account ? addressToActorId(account.address) : null;

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Keep the shared Sails singleton pointed at the active program id.
  useEffect(() => {
    if (sails && hasProgram) {
      try {
        sails.setProgramId(programId as `0x${string}`);
      } catch {
        /* ignore */
      }
    }
  }, [sails, programId, hasProgram]);

  // Refresh when new contract events arrive (battle just changed state).
  const lastEventId = useRef(0);
  useEffect(() => {
    const top = events[0]?.id ?? 0;
    if (top !== lastEventId.current) {
      lastEventId.current = top;
      if (top > 0) refresh();
    }
  }, [events, refresh]);

  // Fetch + poll.
  useEffect(() => {
    if (!ready) {
      setMatches([]);
      setAgents([]);
      setConfig(null);
      return;
    }
    let cancelled = false;
    let firstLoad = matches.length === 0 && agents.length === 0;

    async function load() {
      if (firstLoad) setLoading(true);
      try {
        const [m, a, c] = await Promise.all([
          fetchMatches(sails, 0, 200),
          fetchAgents(sails, 0, 200),
          fetchConfig(sails),
        ]);
        if (cancelled) return;
        setMatches(m);
        setAgents(a);
        setConfig(c);
        setError(null);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load arena.");
      } finally {
        if (!cancelled) setLoading(false);
        firstLoad = false;
      }
    }

    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, sails, programId, tick]);

  const activeMatches = useMemo(
    () => matches.filter((m) => m.status === "Ready"),
    [matches]
  );

  const myAgent = useMemo(() => {
    if (!myActorId) return null;
    return (
      agents.find((a) => a.agentId.toLowerCase() === myActorId.toLowerCase()) ??
      null
    );
  }, [agents, myActorId]);

  // `activeMatches` is derived from the full list (single source of truth)
  // rather than the on-chain ListActiveMatches query, so card state stays
  // consistent with the rest of the arena.
  const value = useMemo<ColosseumState>(
    () => ({
      ready,
      loading,
      error,
      matches,
      activeMatches,
      agents,
      config,
      myActorId,
      myAgent,
      refresh,
    }),
    [
      ready,
      loading,
      error,
      matches,
      activeMatches,
      agents,
      config,
      myActorId,
      myAgent,
      refresh,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useColosseum(): ColosseumState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("ColosseumProvider is required.");
  return ctx;
}
