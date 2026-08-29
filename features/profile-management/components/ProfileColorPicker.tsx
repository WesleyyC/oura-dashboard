"use client";

import {
  DashboardSelector,
  type DashboardSelectorOption,
} from "@/shared/ui";

import {
  PROFILE_COLOR_PALETTE,
  parseProfileColorKey,
  profileColorCssValue,
  type ProfileColorKey,
} from "../domain/profile-colors";

const PROFILE_COLOR_OPTIONS: DashboardSelectorOption[] =
  PROFILE_COLOR_PALETTE.map((color) => ({
    value: color.key,
    label: color.label,
    color: profileColorCssValue(color.key),
  }));

interface ProfileColorPickerProps {
  profileId: string;
  displayName: string;
  colorKey: ProfileColorKey;
  saving: boolean;
  disabled: boolean;
  onChange(colorKey: ProfileColorKey): void;
}

export function ProfileColorPicker({
  profileId,
  displayName,
  colorKey,
  saving,
  disabled,
  onChange,
}: ProfileColorPickerProps) {
  const descriptionId = `profile-color-description-${profileId}`;

  return (
    <div className="profile-color-picker">
      <p id={descriptionId}>
        Used for {displayName} throughout the dashboard.
      </p>
      <DashboardSelector
        id={`profile-color-${profileId}`}
        label="Chart color"
        value={colorKey}
        options={PROFILE_COLOR_OPTIONS}
        disabled={disabled || saving}
        presentation="menu"
        descriptionId={descriptionId}
        onChange={(value) => onChange(parseProfileColorKey(value))}
      />
      {saving ? <p className="profile-color-saving" role="status">Saving color…</p> : null}
    </div>
  );
}
