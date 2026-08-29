import { DashboardScreen } from "@/features/dashboard/client";
import { requireOwner } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Home({ searchParams }: PageProps) {
  await requireOwner("/");
  const params = searchParams ? await searchParams : {};
  const requestedView = Array.isArray(params.view) ? params.view[0] : params.view;
  const initialView = typeof requestedView === "string" ? requestedView : "";

  return <DashboardScreen initialView={initialView} />;
}
