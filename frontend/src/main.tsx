import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ChainProvider } from "./providers/chain-provider";
import { EventsProvider } from "./providers/events-provider";
import { ColosseumProvider } from "./providers/colosseum-provider";
import { ToastProvider } from "./providers/toast-provider";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ChainProvider>
      <ErrorBoundary>
        <EventsProvider>
          <ColosseumProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </ColosseumProvider>
        </EventsProvider>
      </ErrorBoundary>
    </ChainProvider>
  </React.StrictMode>
);
