export type StudioBrowserCapabilities = {
  audioContext: boolean;
  audioWorklet: boolean;
  mediaRecorder: boolean;
  mediaDevices: boolean;
  indexedDb: boolean;
  pointerEvents: boolean;
  sharedArrayBuffer: boolean;
  mobile: boolean;
};

export function certifyStudioBrowser(capabilities: StudioBrowserCapabilities) {
  if (!capabilities.audioContext) {
    return {
      tier: "review" as const,
      canRecord: false,
      canEdit: false,
      canMix: false,
      limitations: ["Web Audio is unavailable; use a current Chrome, Edge, Safari, or Firefox release."],
    };
  }

  const canRecord = capabilities.mediaRecorder && capabilities.mediaDevices;
  const canEdit = capabilities.indexedDb && capabilities.pointerEvents;
  const canMix = true;
  const pro = capabilities.audioWorklet && capabilities.sharedArrayBuffer && canRecord && canEdit && !capabilities.mobile;
  const limitations: string[] = [];
  if (!capabilities.audioWorklet || !capabilities.sharedArrayBuffer || capabilities.mobile) limitations.push("Low-latency monitoring is unavailable; direct monitoring is recommended.");
  if (!canRecord) limitations.push("Browser recording is unavailable; import audio instead.");
  if (!capabilities.indexedDb) limitations.push("Offline recovery is unavailable in this browser mode.");
  if (!capabilities.pointerEvents) limitations.push("Precision clip dragging is unavailable; use keyboard editing controls.");

  return { tier: pro ? "pro" as const : "creator" as const, canRecord, canEdit, canMix, limitations };
}

export function detectStudioBrowserCapabilities(scope: Window = window): StudioBrowserCapabilities {
  const navigatorValue = scope.navigator;
  const audioContext = "AudioContext" in scope || "webkitAudioContext" in scope;
  return {
    audioContext,
    audioWorklet: audioContext && "AudioWorkletNode" in scope,
    mediaRecorder: "MediaRecorder" in scope,
    mediaDevices: Boolean(navigatorValue.mediaDevices?.getUserMedia),
    indexedDb: "indexedDB" in scope,
    pointerEvents: "PointerEvent" in scope,
    sharedArrayBuffer: "SharedArrayBuffer" in scope && scope.crossOriginIsolated,
    mobile: /Android|iPhone|iPad|iPod/i.test(navigatorValue.userAgent),
  };
}
