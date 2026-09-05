import React from "react";
import { createRoot } from "react-dom/client";
import { DashboardScreen } from "@/features/dashboard/components/DashboardScreen";
import "@/app/globals.css";

// The real dashboard/controller, without eagerly mounting the Settings fixture.
createRoot(document.getElementById("root")!).render(<DashboardScreen initialView="alex" />);
