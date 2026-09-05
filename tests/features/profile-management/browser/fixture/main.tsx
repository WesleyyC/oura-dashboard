import React from "react";
import { createRoot } from "react-dom/client";
import { SettingsScreen } from "@/features/profile-management/components/SettingsScreen";
import { GuestOuraConnect } from "@/features/oura-connection/components/GuestOuraConnect";
import { DashboardScreen } from "@/features/dashboard/components/DashboardScreen";
import "@/app/globals.css";

// Actual client controllers; Playwright supplies every API response locally.
// This preview does not load operator env files or host a backend.
const params = new URLSearchParams(location.search);
const screen = location.pathname.startsWith("/connect/oura") ? <GuestOuraConnect />
  : params.get("page") === "dashboard" ? <DashboardScreen initialView={params.get("view") ?? "alex"} />
  : <SettingsScreen callbackStatus={params.get("oura") ?? undefined} />;
createRoot(document.getElementById("root")!).render(screen);
