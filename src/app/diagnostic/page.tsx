"use client";

import dynamic from "next/dynamic";

const WalletDiagnostic = dynamic(
  () => import("@/components/WalletDiagnostic").then((m) => m.WalletDiagnostic),
  { ssr: false },
);

export default function DiagnosticPage() {
  return <WalletDiagnostic />;
}
