import type { StudioSaveState } from "../recovery";
import { getProjectHealth, getSaveStatusText } from "../recovery";

type Props = {
  missingMedia: number;
  clipping: boolean;
  saveState: StudioSaveState;
  savedAt?: string;
};

export function ProjectHealth({ missingMedia, clipping, saveState, savedAt }: Props) {
  const health = getProjectHealth({ missingMedia, clipping, saveState });
  return (
    <span className={`project-health project-health--${health.level}`} role="status" aria-live="polite">
      <i aria-hidden="true" />
      {getSaveStatusText(saveState, savedAt)}
      {missingMedia > 0 && <b>{missingMedia} missing</b>}
    </span>
  );
}
