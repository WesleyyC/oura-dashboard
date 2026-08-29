"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

import type { OuraConnectionTarget } from "@/features/oura-connection/client";
import { runWithConcurrency } from "@/shared/async";
import { resolveLocalTimeZone } from "@/shared/time-zone";
import type { OuraHandoff } from "../components/OuraConnectionHandoff";
import {
  createSettingsApi,
  type SettingsApi,
} from "../client/settings-api";
import type {
  HealthProfileSummary,
} from "../domain/contracts";
import type { ProfileColorKey } from "../domain/profile-colors";
import {
  callbackNotice,
  type ConfigurationStatus,
  type Notice,
} from "./settings-state";

const defaultSettingsApi = createSettingsApi((input, init) => fetch(input, init));

export interface SettingsController {
  configured: ConfigurationStatus | null;
  profiles: HealthProfileSummary[];
  newDisplayName: string;
  deleteConfirmation: string;
  loading: boolean;
  busyAction: string | null;
  notice: Notice | null;
  deleted: boolean;
  handoff: OuraHandoff | null;
  setupReady: boolean;
  setNewDisplayName(value: string): void;
  setDeleteConfirmation(value: string): void;
  addProfile(event: FormEvent<HTMLFormElement>): void;
  addProfileHandoff(): void;
  checkHandoff(target: OuraHandoff, announceWaiting: boolean): Promise<void>;
  cancelHandoff(): Promise<void>;
  closeHandoff(): void;
  renameProfile(profileId: string, displayName: string): Promise<void>;
  updateProfileColor(profileId: string, colorKey: ProfileColorKey): Promise<void>;
  moveProfile(index: number, direction: -1 | 1): Promise<void>;
  removeProfile(profile: HealthProfileSummary): Promise<void>;
  refreshAll(): Promise<void>;
  deleteAccount(event: FormEvent<HTMLFormElement>): Promise<void>;
  startReconnect(profileId: string): void;
  startReconnectHandoff(profileId: string): void;
}

export function useSettingsController(
  callbackStatus?: string,
  api: SettingsApi = defaultSettingsApi,
): SettingsController {
  const [configured, setConfigured] = useState<ConfigurationStatus | null>(null);
  const [profiles, setProfiles] = useState<HealthProfileSummary[]>([]);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(() =>
    callbackStatus ? callbackNotice(callbackStatus) : null
  );
  const [deleted, setDeleted] = useState(false);
  const [handoff, setHandoff] = useState<OuraHandoff | null>(null);
  const [timeZone] = useState(resolveLocalTimeZone);

  const setupReady = Boolean(
    configured?.ouraClientId &&
    configured.ouraClientSecret &&
    configured.tokenEncryptionKey,
  );

  const loadSetup = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    try {
      const [account, profileResponse] = await Promise.all([
        api.loadAccount(),
        api.loadProfiles(),
      ]);
      setConfigured(account.configured);
      setProfiles(profileResponse.profiles);
    } catch {
      setNotice({
        tone: "error",
        text: "Settings could not be loaded. Try again.",
      });
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (callbackStatus) {
      window.history.replaceState(null, "", "/settings");
    }
    void Promise.resolve().then(loadSetup);
  }, [callbackStatus, loadSetup]);

  const checkHandoff = useCallback(async (
    target: OuraHandoff,
    announceWaiting: boolean,
  ) => {
    if (Date.parse(target.expiresAt) <= Date.now()) {
      setHandoff(null);
      setBusyAction(null);
      setNotice({
        tone: "neutral",
        text: "That connection link expired. Create a new one to continue.",
      });
      return;
    }
    try {
      const response = await api.loadProfiles();
      setProfiles(response.profiles);
      const profile = response.profiles.find(({ id }) => id === target.profileId);
      if (
        profile?.status === "connected" &&
        profile.updatedAt !== target.profileUpdatedAt
      ) {
        setHandoff(null);
        setBusyAction(null);
        setNotice({
          tone: "success",
          text: `Oura connected for ${target.displayName}.`,
        });
      } else if (announceWaiting) {
        setNotice({
          tone: "neutral",
          text: `Still waiting for ${target.displayName} to finish connecting.`,
        });
      }
    } catch {
      if (announceWaiting) {
        setNotice({
          tone: "error",
          text: "Connection status could not be checked. Try again.",
        });
      }
    }
  }, [api]);

  useEffect(() => {
    if (!handoff) return;
    const interval = window.setInterval(() => {
      void checkHandoff(handoff, false);
    }, 3_000);
    return () => window.clearInterval(interval);
  }, [checkHandoff, handoff]);

  async function startOAuth(input: OuraConnectionTarget) {
    setBusyAction(
      input.mode === "add" ? "add" : `reconnect:${input.profileId}`,
    );
    setNotice(null);
    try {
      const { authorizationUrl } = await api.startAuthorization(input);
      const destination = new URL(authorizationUrl);
      if (
        destination.protocol !== "https:" ||
        destination.hostname !== "cloud.ouraring.com"
      ) {
        throw new Error("Oura returned an invalid authorization destination");
      }
      window.location.assign(authorizationUrl);
    } catch {
      setBusyAction(null);
      setNotice({
        tone: "error",
        text: "The Oura connection could not be started. Try again.",
      });
    }
  }

  async function startHandoff(input: OuraConnectionTarget) {
    setBusyAction(
      input.mode === "add"
        ? "handoff-start:add"
        : `handoff-start:${input.profileId}`,
    );
    setNotice(null);
    try {
      const response = await api.createInvite(input);
      setProfiles((current) => {
        const exists = current.some(({ id }) => id === response.profile.id);
        return exists
          ? current.map((profile) =>
              profile.id === response.profile.id ? response.profile : profile
            )
          : [...current, response.profile].sort(
              (left, right) => left.sortOrder - right.sortOrder,
            );
      });
      setHandoff({
        profileId: response.profile.id,
        displayName: response.profile.displayName,
        connectUrl: response.handoff.connectUrl,
        expiresAt: response.handoff.expiresAt,
        profileUpdatedAt: response.profile.updatedAt,
      });
      if (input.mode === "add") setNewDisplayName("");
      setBusyAction("handoff-open");
    } catch {
      setBusyAction(null);
      setNotice({
        tone: "error",
        text: "The connection link could not be created. Try again.",
      });
    }
  }

  async function cancelHandoff() {
    if (!handoff) return;
    setBusyAction("handoff-cancel");
    try {
      await api.cancelInvite(handoff.profileId);
      setHandoff(null);
      setNotice({ tone: "neutral", text: "Connection link canceled." });
    } catch {
      setNotice({
        tone: "error",
        text: "The connection link could not be canceled. Try again.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  function closeHandoff() {
    setHandoff(null);
    setBusyAction(null);
  }

  function addProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const displayName = newDisplayName.trim();
    if (!displayName) return;
    void startOAuth({ mode: "add", displayName });
  }

  function addProfileHandoff() {
    const displayName = newDisplayName.trim();
    if (!displayName) return;
    void startHandoff({ mode: "add", displayName });
  }

  async function renameProfile(profileId: string, displayName: string) {
    setBusyAction(`rename:${profileId}`);
    setNotice(null);
    try {
      const response = await api.updateProfile({ profileId, displayName });
      setProfiles((current) =>
        current.map((profile) =>
          profile.id === profileId ? response.profile : profile
        ),
      );
      setNotice({ tone: "success", text: "Display name updated." });
    } catch {
      setNotice({
        tone: "error",
        text: "The display name could not be updated.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function updateProfileColor(
    profileId: string,
    colorKey: ProfileColorKey,
  ) {
    const displayName =
      profiles.find(({ id }) => id === profileId)?.displayName ?? "this profile";
    setBusyAction(`color:${profileId}`);
    setNotice(null);
    try {
      const response = await api.updateProfile({ profileId, colorKey });
      setProfiles((current) =>
        current.map((profile) =>
          profile.id === profileId ? response.profile : profile
        ),
      );
      setNotice({
        tone: "success",
        text: `Chart color updated for ${response.profile.displayName}.`,
      });
    } catch {
      setNotice({
        tone: "error",
        text: `The chart color for ${displayName} could not be updated.`,
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function moveProfile(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= profiles.length) return;
    const reordered = [...profiles];
    [reordered[index], reordered[targetIndex]] = [
      reordered[targetIndex],
      reordered[index],
    ];
    setBusyAction("reorder");
    setNotice(null);
    try {
      await Promise.all(
        reordered.map((profile, sortOrder) =>
          profile.sortOrder === sortOrder
            ? Promise.resolve()
            : api.updateProfile({ profileId: profile.id, sortOrder }),
        ),
      );
      setProfiles(
        reordered.map((profile, sortOrder) => ({ ...profile, sortOrder })),
      );
    } catch {
      setNotice({
        tone: "error",
        text: "The family order could not be updated.",
      });
      await loadSetup();
    } finally {
      setBusyAction(null);
    }
  }

  async function removeProfile(profile: HealthProfileSummary) {
    const confirmed = window.confirm(
      `Remove ${profile.displayName} from this dashboard? Their saved health data and Oura connection will be deleted.`,
    );
    if (!confirmed) return;
    setBusyAction(`remove:${profile.id}`);
    setNotice(null);
    try {
      await api.removeProfile(profile.id);
      setProfiles((current) =>
        current.filter(({ id }) => id !== profile.id)
      );
      setNotice({
        tone: "success",
        text: `${profile.displayName} was removed.`,
      });
    } catch {
      setNotice({
        tone: "error",
        text: `${profile.displayName} could not be removed.`,
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function refreshAll() {
    const connected = profiles.filter(
      ({ status }) => status === "connected",
    );
    if (!connected.length) return;
    setBusyAction("refresh");
    setNotice({
      tone: "neutral",
      text: `Refreshing ${connected.length === 1 ? connected[0].displayName : `${connected.length} family members`}…`,
    });
    const results = await runWithConcurrency(connected, 2, (profile) =>
      api.refreshProfile(profile.id, timeZone)
    );
    await loadSetup();
    const succeeded = results.filter(
      (result) =>
        result.status === "fulfilled" &&
        (result.value.status === "refreshed" ||
          result.value.status === "fresh"),
    ).length;
    const failed = results.length - succeeded;
    setNotice(
      failed
        ? {
            tone: "error",
            text: `${succeeded} refreshed. ${failed} ${failed === 1 ? "profile needs" : "profiles need"} attention.`,
          }
        : {
            tone: "success",
            text: `${succeeded === 1 ? connected[0].displayName : "Everyone"} refreshed.`,
          },
    );
    setBusyAction(null);
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deleteConfirmation !== "DELETE") return;
    setBusyAction("delete-account");
    setNotice(null);
    try {
      await api.deleteAccount();
      setProfiles([]);
      setDeleted(true);
      setNotice({
        tone: "success",
        text: "Your dashboard data and Oura connections were deleted.",
      });
    } catch {
      setNotice({
        tone: "error",
        text: "Your dashboard data could not be deleted.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  return {
    configured,
    profiles,
    newDisplayName,
    deleteConfirmation,
    loading,
    busyAction,
    notice,
    deleted,
    handoff,
    setupReady,
    setNewDisplayName,
    setDeleteConfirmation,
    addProfile,
    addProfileHandoff,
    checkHandoff,
    cancelHandoff,
    closeHandoff,
    renameProfile,
    updateProfileColor,
    moveProfile,
    removeProfile,
    refreshAll,
    deleteAccount,
    startReconnect: (profileId) => {
      void startOAuth({ mode: "reconnect", profileId });
    },
    startReconnectHandoff: (profileId) => {
      void startHandoff({ mode: "reconnect", profileId });
    },
  };
}
