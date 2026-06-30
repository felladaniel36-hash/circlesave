import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Family Rent Vault · FlowVault",
  description:
    "Collaborative goal-based savings on Stacks — enforced time-locks and automated landlord routing built on FlowVault Lock + Split primitives.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
