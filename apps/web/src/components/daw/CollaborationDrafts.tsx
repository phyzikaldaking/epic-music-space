"use client";

import { useState } from "react";

interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  timestamp: number; // seconds in track
  createdAt: Date;
}

export default function CollaborationDrafts({
  projectId,
  userId,
  onCommentAdded,
}: {
  projectId: string;
  userId: string;
  onCommentAdded?: (comment: Comment) => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [loading, setLoading] = useState(false);

  async function addComment() {
    if (!newComment.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/studio/drafts/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          authorId: userId,
          text: newComment,
          timestamp: currentTime,
        }),
      });

      if (!res.ok) throw new Error("Failed to add comment");

      const comment = (await res.json()) as Comment;
      setComments((prev) => [...prev, comment]);
      onCommentAdded?.(comment);
      setNewComment("");
    } catch (err) {
      console.error("Add comment failed:", err);
    } finally {
      setLoading(false);
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-[#0c0c12] p-4">
      <h3 className="text-sm font-bold text-white">💬 Collaboration Drafts</h3>

      {/* Add Comment */}
      <div className="space-y-2 rounded bg-white/5 p-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Leave feedback at this moment…"
            className="flex-1 text-xs rounded bg-white/5 border border-white/10 px-2 py-1 text-white placeholder:text-white/30 focus:outline-none focus:border-tube-300"
          />
          <button
            onClick={addComment}
            disabled={!newComment.trim() || loading}
            className="px-2 py-1 text-xs font-bold rounded bg-tube-300 text-black hover:bg-tube-200 disabled:opacity-50"
          >
            Send
          </button>
        </div>
        <p className="text-[10px] text-white/40">@ {formatTime(currentTime)}</p>
      </div>

      {/* Comments Timeline */}
      {comments.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {comments.map((comment) => (
            <div
              key={comment.id}
              onClick={() => setCurrentTime(comment.timestamp)}
              className="cursor-pointer rounded bg-white/5 p-2 hover:bg-white/10 transition"
            >
              <div className="flex items-start justify-between mb-1">
                <p className="text-[10px] font-bold text-white">{comment.authorName}</p>
                <p className="text-[10px] text-tube-300">{formatTime(comment.timestamp)}</p>
              </div>
              <p className="text-xs text-white/70">{comment.text}</p>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-white/50">
        Add feedback tied to specific moments. Click a comment to jump to that time.
      </p>
    </div>
  );
}
