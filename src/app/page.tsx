import { FamilyRentVaultLanding } from "@/components/FamilyRentVaultLanding";

// This page imports browser-only wallet libraries (@stacks/connect,
// @stacks/transactions) that cannot be statically prerendered on the server.
// Opt out of static generation so the client component renders in the browser.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return <FamilyRentVaultLanding />;
}
