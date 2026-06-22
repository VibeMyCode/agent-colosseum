import { useState, useEffect } from "react";
import { useChainApi } from "@/providers/chain-provider";
import { initSails } from "@/lib/sails-client";

/**
 * Shared hook for accessing the Sails instance.
 * Handles lazy initialization and API reconnection (stale cache fix).
 */
export function useSails() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sails, setSails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { api, apiStatus } = useChainApi();

  useEffect(() => {
    if (!api || apiStatus !== "ready") {
      setSails(null);
      setLoading(true);
      setError(null);
      return;
    }

    let cancelled = false;

    setLoading(true);
    setError(null);

    initSails(api)
      .then((s) => {
        if (!cancelled) {
          setSails(s);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to initialize Sails");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, apiStatus]);

  return { sails, loading, error };
}
