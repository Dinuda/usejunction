import type { ReactNode } from "react";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { SignalsHubNav } from "@/components/signals/signals-hub-nav";

export function SignalsPageHeader({
  title,
  description,
  eyebrow,
  children,
}: {
  title: ReactNode;
  description?: string;
  /** Optional line above the title (e.g. back link). */
  eyebrow?: ReactNode;
  /** Extra content under the title row. */
  children?: ReactNode;
}) {
  return (
    <PageHeader
      title={title}
      description={description}
      eyebrow={eyebrow}
      actions={
        <Suspense fallback={null}>
          <SignalsHubNav />
        </Suspense>
      }
    >
      {children ? <Suspense fallback={null}>{children}</Suspense> : null}
    </PageHeader>
  );
}
