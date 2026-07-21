"use client";

import dynamic from "next/dynamic";
import { AppPageSkeleton } from "@/components/app-data-state";

const DashboardClientScreen = dynamic(
  () => import("@/components/dashboard/dashboard-client-screen"),
  {
    ssr: false,
    loading: () => <AppPageSkeleton />,
  },
);

export default function DashboardPage() {
  return <DashboardClientScreen />;
}
