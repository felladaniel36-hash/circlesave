"use client";

// ===========================================================================
// CircleSaveWrapper — disables SSR for the wallet-heavy CircleSave component
// ===========================================================================
// @stacks/connect and @stacks/transactions are browser-only libraries that
// crash during server-side rendering. This wrapper uses next/dynamic with
// ssr:false to load CircleSave purely on the client.
// ===========================================================================

import dynamic from "next/dynamic";

const CircleSave = dynamic(
  () => import("./CircleSave").then((m) => m.CircleSave),
  {
    ssr: false,
    loading: () => (
      <div className="pt-28 pb-20 px-6 max-w-7xl mx-auto">
        <div className="text-center">
          <div className="cs-logo-spin inline-block mb-4">
            <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
              <circle cx="11" cy="12" r="5" stroke="#ffb690" strokeWidth="2.2" />
              <circle cx="21" cy="12" r="5" stroke="#ffb690" strokeWidth="2.2" />
              <circle cx="16" cy="21" r="5" stroke="#ffb690" strokeWidth="2.2" />
            </svg>
          </div>
          <p className="text-on-surface-variant">Loading CircleSave…</p>
        </div>
      </div>
    ),
  },
);

export function CircleSaveWrapper() {
  return <CircleSave />;
}
