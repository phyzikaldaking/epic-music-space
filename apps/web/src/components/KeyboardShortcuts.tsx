"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/contexts/PlayerContext";

/**
 * Global keyboard shortcuts. Skipped while the user is typing in any
 * editable surface (input/textarea/contenteditable) so we don't hijack
 * normal keystrokes.
 *
 *  /   focus the navbar search box
 *  k   focus the navbar search box (Cmd-K convention without the meta)
 *  Space toggle play/pause when audio is loaded
 *  ArrowLeft / ArrowRight   skip ±5s
 *  ?    show shortcut help (toast-style alert for now)
 */
export default function KeyboardShortcuts() {
  const router = useRouter();
  const player = usePlayer();

  useEffect(() => {
    function isEditable(t: EventTarget | null) {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t.isContentEditable
      );
    }

    function focusSearch() {
      const el = document.querySelector<HTMLInputElement>('input[type="search"]');
      if (el) {
        el.focus();
        el.select();
      } else {
        router.push("/search");
      }
    }

    function onKey(e: KeyboardEvent) {
      if (isEditable(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "/" || e.key === "k") {
        e.preventDefault();
        focusSearch();
        return;
      }
      if (e.key === " " && player.currentSong) {
        e.preventDefault();
        player.togglePlay();
        return;
      }
      if (e.key === "ArrowRight" && player.currentSong) {
        e.preventDefault();
        const next = Math.min(100, player.progress + 5);
        player.seekTo(next);
        return;
      }
      if (e.key === "ArrowLeft" && player.currentSong) {
        e.preventDefault();
        const next = Math.max(0, player.progress - 5);
        player.seekTo(next);
        return;
      }
      if (e.key === "?" && e.shiftKey) {
        e.preventDefault();
        alert(
          [
            "Keyboard shortcuts:",
            "  /  or  k     Search",
            "  Space        Play / pause",
            "  ← / →        Skip 5%",
            "  ?            This help",
          ].join("\n"),
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, player]);

  return null;
}
