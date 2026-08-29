import type { Notice } from "../model/settings-state";

export interface SetupNoticeProps {
  notice: Notice;
}

export function SetupNotice({ notice }: SetupNoticeProps) {
  return (
    <div
      className="setup-notice"
      data-tone={notice.tone}
      role={notice.tone === "error" ? "alert" : "status"}
    >
      {notice.text}
    </div>
  );
}
