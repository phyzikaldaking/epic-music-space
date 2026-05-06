"use client";

import { Component, type ReactNode } from "react";

interface Props {
  title?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <section className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-red-400/70">
            {this.props.title ?? "Section"} failed to load
          </p>
          <p className="mt-1 text-xs text-white/30">{this.state.error.message}</p>
        </section>
      );
    }
    return this.props.children;
  }
}
