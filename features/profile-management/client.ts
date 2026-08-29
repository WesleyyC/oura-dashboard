export * from "./domain/contracts";
export * from "./domain/profile-colors";
export * from "./domain/validation";

export async function loadSettingsScreen() {
  const { SettingsScreen } = await import("./components/SettingsScreen");
  return SettingsScreen;
}
