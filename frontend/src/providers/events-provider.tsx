import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useSails } from "@/hooks/use-sails";
import { useChainApi } from "@/providers/chain-provider";

let eventId = 0;

export type ContractEvent = {
  id: number;
  name: string;
  data: Record<string, unknown>;
  timestamp: number;
};

type EventsState = {
  events: ContractEvent[];
  status: "idle" | "subscribing" | "listening" | "error";
  clearEvents: () => void;
};

const EventsContext = createContext<EventsState>({
  events: [],
  status: "idle",
  clearEvents: () => {},
});

const MAX_EVENTS = 50;

export function EventsProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<ContractEvent[]>([]);
  const [status, setStatus] = useState<EventsState["status"]>("idle");
  const { sails, loading } = useSails();
  const { programId } = useChainApi();

  const clearEvents = useCallback(() => setEvents([]), []);

  const pushEvent = useCallback((name: string, data: Record<string, unknown>) => {
    setEvents((prev) => {
      const next = [{ id: ++eventId, name, data, timestamp: Date.now() }, ...prev];
      return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
    });
  }, []);

  useEffect(() => {
    if (!sails || loading || !programId) {
      setStatus("idle");
      return;
    }

    // Find the first service (usually "Demo")
    const serviceNames = Object.keys(sails.services || {});
    if (serviceNames.length === 0) {
      setStatus("idle");
      return;
    }

    const service = sails.services[serviceNames[0]];
    if (!service?.events) {
      setStatus("idle");
      return;
    }

    setStatus("subscribing");

    const unsubscribers: (() => void)[] = [];
    let cancelled = false;

    async function subscribeAll() {
      const eventNames = Object.keys(service.events);
      let successCount = 0;
      for (const eventName of eventNames) {
        if (cancelled) return;
        try {
          const unsub = await service.events[eventName].subscribe(
            (data: Record<string, unknown>) => {
              if (!cancelled) {
                pushEvent(eventName, data);
              }
            }
          );
          if (!cancelled) {
            unsubscribers.push(unsub);
            successCount++;
          } else {
            unsub();
          }
        } catch {
          // Individual event subscription failure is non-fatal
        }
      }
      if (!cancelled) {
        setStatus(successCount > 0 ? "listening" : "error");
      }
    }

    subscribeAll().catch(() => {
      if (!cancelled) setStatus("error");
    });

    return () => {
      cancelled = true;
      unsubscribers.forEach((unsub) => unsub());
      setStatus("idle");
    };
  }, [sails, loading, programId, pushEvent]);

  return (
    <EventsContext.Provider value={{ events, status, clearEvents }}>
      {children}
    </EventsContext.Provider>
  );
}

export function useEvents() {
  return useContext(EventsContext);
}
