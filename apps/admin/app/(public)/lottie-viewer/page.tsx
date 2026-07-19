import type { Metadata } from "next";
import { LottieViewer } from "@/components/public/lottie-viewer";

export const metadata: Metadata = {
  title: "DotLottie Viewer | UseJunction",
  description: "Preview and scrub the UseJunction hero animation.",
};

export default function LottieViewerPage() {
  return <LottieViewer />;
}
