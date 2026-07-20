"use client";

import { WalletCards } from "lucide-react";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Panel } from "@/components/panel";
import { SignalsSectionHeader } from "@/components/signals/signals-ui";

export function ApiCreditInventory() {
  return (
    <Panel as="section">
      <SignalsSectionHeader
        title="API credit pools."
        description="Track OpenAI and Anthropic API budgets against verified spend."
        bordered
      />
      <Empty className="min-h-0 py-16">
        <div className="flex size-10 items-center justify-center bg-muted">
          <WalletCards className="size-5" />
        </div>
        <EmptyTitle>Coming soon</EmptyTitle>
        <EmptyDescription>
          API credit tracking for OpenAI and Anthropic will be available in a later release.
        </EmptyDescription>
      </Empty>
    </Panel>
  );
}
