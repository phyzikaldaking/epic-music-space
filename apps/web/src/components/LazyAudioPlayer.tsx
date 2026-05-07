"use client";

import AudioPlayer from "./AudioPlayer";
import type { AudioPlayerProps } from "./AudioPlayer";

export default function LazyAudioPlayer(props: AudioPlayerProps) {
  return <AudioPlayer {...props} />;
}
