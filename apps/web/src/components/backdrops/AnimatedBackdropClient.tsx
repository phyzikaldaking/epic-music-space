"use client";

import dynamic from "next/dynamic";

const AnimatedBackdrop = dynamic(() => import("./AnimatedBackdrop"), {
  ssr: false,
});

type Props = {
  variant: "hero" | "versus" | "vault";
  className?: string;
};

export default function AnimatedBackdropClient(props: Props) {
  return <AnimatedBackdrop {...props} />;
}
