import type { Metadata } from "next";

import { GuestOuraConnect } from "@/features/oura-connection/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connect Oura",
  description: "Connect an Oura account to a family dashboard.",
  robots: { index: false, follow: false },
};

export default function GuestOuraConnectPage() {
  return <GuestOuraConnect />;
}
