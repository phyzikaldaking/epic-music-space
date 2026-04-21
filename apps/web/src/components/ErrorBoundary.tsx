"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Something went wrong",
    };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex h-full min-h-[200px] w-full items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center">
        <div>
          <p className="text-sm font-semibold text-red-400">
            {this.props.label ?? "Component"} failed to load
          </p>
          <p className="mt-1 text-xs text-white/30">{this.state.message}</p>
          <button
            className="mt-4 rounded-lg border border-white/10 px-4 py-1.5 text-xs text-white/50 hover:text-white/80 transition"
            onClick={() => this.setState({ hasError: false, message: "" })}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
