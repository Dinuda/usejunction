"use client";

import { useRouter } from "next/navigation";
import { DeviceConnectCard } from "@/components/onboarding/device-connect-card";
import { InviteTeamForm } from "@/components/onboarding/invite-team-form";

export function DashboardSetupPanel({ canInvite = true }: { canInvite?: boolean }) {
  const router = useRouter();

  return (
    <div className={canInvite ? "grid gap-8 lg:grid-cols-2" : "max-w-xl"}>
      <section>
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-primary">
          {canInvite ? "Step 1" : "Connect"}
        </p>
        <h2 className="mt-3 text-xl font-semibold tracking-tight">Connect this machine.</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Copy the command, run it in Terminal. We mark the device online when enroll succeeds.
        </p>
        <div className="mt-5">
          <DeviceConnectCard
            title="Connect command"
            description="One curl. Expires in 15 minutes."
            onConnected={() => router.refresh()}
          />
        </div>
      </section>
      {canInvite && (
        <section>
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-primary">Step 2</p>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">Invite the team.</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            They get a join link, sign in, and run the same connect flow on their machines.
          </p>
          <div className="mt-5 border bg-card p-5">
            <InviteTeamForm onInvited={() => router.refresh()} />
          </div>
        </section>
      )}
    </div>
  );
}
