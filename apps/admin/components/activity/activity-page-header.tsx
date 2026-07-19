import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";

export function ActivityPageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
}) {
  return <PageHeader title={title} description={description} actions={actions} />;
}
