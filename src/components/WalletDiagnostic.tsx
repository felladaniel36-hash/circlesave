"use client";

import { useState, useEffect } from "react";
import { connect } from "@stacks/connect";
import { NETWORK } from "@/lib/config";
import { extractStxAddress } from "@/lib/wallet";

export function WalletDiagnostic() {
  const [providers, setProviders] = useState<Record<string, boolean>>({});
  const [log, setLog] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);

  const add = (m: string) => {
    setLog((p) => [...p, `[${new Date().toLocaleTimeString()}] ${m}`]);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as Record<string, unknown>;
    const checks: Record<string, boolean> = {
      "window.StacksProvider": !!w.StacksProvider,
      "window.LeatherProvider": !!w.LeatherProvider,
      "window.HiroWallet": !!w.HiroWallet,
      "window.xverse": !!w.xverse,
      "window.stacks": !!w.stacks,
      "window.btc": !!w.btc,
      "window.BTCProvider": !!w.BTCProvider,
    };
    setProviders(checks);
    add("Scan complete. Look at the list above — which are DETECTED?");
    const extra = Object.keys(w).filter((k) =>
      /wallet|stacks|leather|xverse|hiro|provider|web3|btc/i.test(k),
    );
    if (extra.length) add(`Other wallet-related keys: ${extra.join(", ")}`);
  }, []);

  const test = async () => {
    setTesting(true);
    add("Calling connect()... a wallet popup SHOULD appear.");
    try {
      const res = await Promise.race([
        connect({ network: NETWORK }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("TIMEOUT_15s")), 15000)),
      ]);
      add("✓ connect() returned!");
      add(`addresses: ${JSON.stringify(res?.addresses)?.slice(0, 150)}`);
    } catch (e) {
      add(`✗ FAILED: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTesting(false);
    }
  };

  const anyDetected = Object.values(providers).some(Boolean);

  return (
    <div style={{ maxWidth: 700, margin: "60px auto", padding: 24, fontFamily: "monospace", color: "#e4e1e5", background: "#0d1230", borderRadius: 16 }}>
      <h1 style={{ color: "#ffb690", fontSize: 22 }}>Wallet Diagnostic</h1>
      <p style={{ color: "#98a2b8", fontSize: 13, marginBottom: 20 }}>
        Tell me what this page shows. The result determines whether it&apos;s a code problem or a wallet-extension problem.
      </p>

      <h2 style={{ fontSize: 15, color: "#fff" }}>1. Wallet Providers Detected</h2>
      <div style={{ display: "grid", gap: 8, margin: "12px 0 20px" }}>
        {Object.entries(providers).map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: v ? "rgba(16,185,129,0.1)" : "rgba(251,113,133,0.08)", border: `1px solid ${v ? "rgba(16,185,129,0.3)" : "rgba(251,113,133,0.2)"}`, borderRadius: 8 }}>
            <span style={{ fontSize: 13 }}>{k}</span>
            <span style={{ fontWeight: 700, color: v ? "#34d399" : "#fb7185" }}>{v ? "✓ DETECTED" : "✗ not found"}</span>
          </div>
        ))}
      </div>

      {!anyDetected && (
        <div style={{ padding: 16, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, marginBottom: 20, fontSize: 13, color: "#fbbf24" }}>
          ⚠ <strong>NO wallets detected.</strong> This means Xverse is NOT visible to the page. Causes: extension disabled, wrong browser profile, or Xverse no longer injecting a Stacks provider. <strong>Try installing Leather wallet instead</strong> — it&apos;s the officially recommended Stacks wallet.
        </div>
      )}

      <h2 style={{ fontSize: 15, color: "#fff" }}>2. Connection Test</h2>
      <button onClick={test} disabled={testing} style={{ padding: "12px 24px", background: "#f97316", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", marginBottom: 16, opacity: testing ? 0.6 : 1 }}>
        {testing ? "Testing (15s)..." : "▶ Test connect()"}
      </button>

      <h2 style={{ fontSize: 15, color: "#fff" }}>3. Log (copy this for me)</h2>
      <div style={{ background: "#000", borderRadius: 8, padding: 16, minHeight: 100, maxHeight: 300, overflowY: "auto", border: "1px solid #27272a" }}>
        {log.length === 0 ? <p style={{ color: "#6b7488", fontSize: 13 }}>Waiting...</p> : log.map((l, i) => (
          <div key={i} style={{ fontSize: 12, lineHeight: 1.6, color: l.includes("✗") ? "#fb7185" : l.includes("✓") ? "#34d399" : "#98a2b8", wordBreak: "break-word" }}>{l}</div>
        ))}
      </div>
    </div>
  );
}
