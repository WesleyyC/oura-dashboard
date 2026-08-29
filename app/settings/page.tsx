import { loadSettingsScreen } from "@/features/profile-management/client";
import { requireOwner } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

interface SettingsPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SettingsPage({
  searchParams,
}: SettingsPageProps) {
  await requireOwner("/settings");
  const SettingsScreen = await loadSettingsScreen();
  const params = searchParams ? await searchParams : {};
  const ouraStatus = Array.isArray(params.oura) ? params.oura[0] : params.oura;

  return <SettingsScreen callbackStatus={ouraStatus} />;
}
