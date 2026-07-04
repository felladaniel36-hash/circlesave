"use client";

import { useState, useEffect } from "react";
import { connect } from "@stacks/connect";
import { NETWORK } from "@/lib/constants";

interface ProviderInfo {
  name: string;
  present: boolean;
  value: string;
}

export function WalletDiagnostic() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLog((prev) => [...prev, `[${time}] ${msg}`]);
  };

  // Detect what wallet providers are actually injected into the browser
  useEffect(() => {
    const detected: ProviderInfo[] = [
      { name: "window.StacksProvider", present: typeof window !== "undefined" && !!(window as unknown as Record<string, unknown>).StacksProvider, value: typeof window !== "undefined" ? String(!!(window as unknown as Record<string, unknown>).StacksProvider) : "n/a" },
      { name: "window.LeatherProvider", present: typeof window !== "undefined" && !!(window as unknown as Record<string, unknown>).LeatherProvider, value: typeof window !== "undefined" ? String(!!(window as unknown as Record<string, unknown>).LeatherProvider) : "n/a" },
      { name: "window.HiroWallet", present: typeof window !== "undefined" && !!(window as unknown as Record<string, unknown>).HiroWallet, value: typeof window !== "undefined" ? String(!!(window as unknown as Record<string, unknown>).HiroWallet) : "n/a" },
      { name: "window.xverse", present: typeof window !== "undefined" && !!(window as unknown as Record<string, unknown>).xverse, value: typeof window !== "undefined" ? String(!!(window as unknown as Record<string, unknown>).xverse) : "n/a" },
      { name: "window.web3stacks", present: typeof window !== "undefined" && !!(window as unknown as Record<string, unknown>).web3stacks, value: typeof window !== "undefined" ? String(!!(window as unknown as Record<string, unknown>).web3stacks) : "n/a" },
    ];
    setProviders(detected);
    addLog("Diagnostic loaded. Scanning for wallet providers...");

    // List ALL non-standard window keys that might be wallet injections
    if (typeof window !== "undefined") {
      const walletKeys = Object.keys(window).filter((k) =>
        /wallet|stacks|leather|xverse|hiro|provider|web3/i.test(k)
      );
      if (walletKeys.length > 0) {
        addLog(`Other wallet-related window keys found: ${walletKeys.join(", ")}`);
      } else {
        addLog("No other wallet-related keys found on window.");
      }
    }
  }, []);

  // Test the connect() call with full logging
  const testConnect = async () => {
    setTesting(true);
    addLog("▶ Calling connect() from @stacks/connect...");
    try {
      addLog(`  network: ${NETWORK}`);
      const timeoutPromise = new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error("TIMEOUT_15s")), 15000)
      );
      addLog("  Waiting for wallet response (15s timeout)...");
      const res = await Promise.race([
        connect({ network: NETWORK }),
        timeoutPromise,
      ]);
      addLog(`✓ connect() resolved!`);
      addLog(`  Response keys: ${JSON.stringify(Object.keys(res || {}))}`);
      addLog(`  addresses type: ${typeof res?.addresses}`);
      if (res?.addresses) {
        addLog(`  addresses: ${JSON.stringify(res.addresses).slice(0, 200)}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? e.stack : "";
      addLog(`✗ FAILED: ${msg}`);
      if (stack) addLog(`  stack: ${stack.slice(0, 300)}`);
    } finally {
      setTesting(false);
    }
  };

  const anyPresent = providers.some((p) => p.present);

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 24, fontFamily: "monospace", color: "#e4e1e5", background: "#0d1230", borderRadius: 16 }}>
      <h1 style={{ fontSize: 22, color: "#ffb690", marginBottom: 4 }}>Wallet Diagnostic</h1>
      <p style={{ fontSize: 13, color: "#98a2b8", marginBottom: 24 }}>
        This page checks what your browser actually sees. Open the results below, then share them with me.
      </p>

      {/* Provider detection */}
      <h2 style={{ fontSize: 15, color: "#fff", marginBottom: 12 }}>1. Detected Wallet Providers</h2>
      <div style={{ display: "grid", gap: 8, marginBottom: 24 }}>
        {providers.map((p) => (
          <div key={p.name} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: p.present ? "rgba(16,185,129,0.1)" : "rgba(251,113,133,0.08)", border: `1px solid ${p.present ? "rgba(16,185,129,0.3)" : "rgba(251,113,133,0.2)"}`, borderRadius: 8 }}>
            <span style={{ fontSize: 13 }}>{p.name}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: p.present ? "#34d399" : "#fb7185" }}>
              {p.present ? "✓ DETECTED" : "✗ NOT FOUND"}
            </span>
          </div>
        ))}
      </div>

      {!anyPresent && (
        <div style={{ padding: 16, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, marginBottom: 24, fontSize: 13, color: "#fbbf24" }}>
          ⚠ <strong>No wallet providers detected.</strong> This means your wallet extension (Xverse/Leather) is either:
          <br />• Not installed, or disabled in your browser
          <br />• Installed but you&apos;re on a different browser profile
          <br />• Installed but not allowed to run on localhost
          <br /><br />
          <strong>Fix:</strong> Check <code>chrome://extensions</code> (or <code>edge://extensions</code>) — make sure Xverse is <em>enabled</em>. Then refresh this page.
        </div>
      )}

      {anyPresent && (
        <div style={{ padding: 16, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, marginBottom: 24, fontSize: 13, color: "#34d399" }}>
          ✓ At least one wallet provider is detected. Try the connection test below.
        </div>
      )}

      {/* Connection test */}
      <h2 style={{ fontSize: 15, color: "#fff", marginBottom: 12 }}>2. Connection Test</h2>
      <button
        onClick={testConnect}
        disabled={testing}
        style={{ padding: "12px 24px", background: "#f97316", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: testing ? "wait" : "pointer", fontSize: 14, marginBottom: 16, opacity: testing ? 0.6 : 1 }}
      >
        {testing ? "Testing... (wait 15s)" : "▶ Test connect()"}
      </button>

      {/* Log output */}
      <h2 style={{ fontSize: 15, color: "#fff", marginBottom: 12 }}>3. Diagnostic Log</h2>
      <div style={{ background: "#000", borderRadius: 8, padding: 16, minHeight: 120, maxHeight: 320, overflowY: "auto", border: "1px solid #27272a" }}>
        {log.length === 0 ? (
          <p style={{ color: "#6b7488", fontSize: 13 }}>Waiting...</p>
        ) : (
          log.map((line, i) => (
            <div key={i} style={{ fontSize: 12, lineHeight: 1.6, color: line.includes("✗") || line.includes("FAIL") ? "#fb7185" : line.includes("✓") ? "#34d399" : "#98a2b8", marginBottom: 2, wordBreak: "break-word" }}>
              {line}
            </div>
          ))
        )}
      </div>

      <p style={{ fontSize: 12, color: "#6b7488", marginTop: 16, lineHeight: 1.5 }}>
        Copy everything in the log box above and paste it to me. That will tell us exactly where the connection is failing.
      </p>
    </div>
  );
}
