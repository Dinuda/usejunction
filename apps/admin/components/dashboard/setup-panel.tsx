"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { DeviceConnectCard, type DeviceConnectCardHandle } from "@/components/onboarding/device-connect-card";
import { InviteTeamForm } from "@/components/onboarding/invite-team-form";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { useInvalidateAppData } from "@/lib/api/client";
import { cn } from "@/lib/utils";

function SetupCard({
  children,
  imageSrc,
  className,
}: {
  children: React.ReactNode;
  imageSrc: string;
  className?: string;
}) {
  return (
    <Panel padded={false} className={cn("flex h-[36rem] flex-col overflow-hidden border-border", className)}>
      <div
        className="relative h-40 shrink-0 overflow-hidden border-b border-border bg-muted"
        aria-hidden
      >
        <Image
          src={imageSrc}
          alt=""
          fill
          sizes="(min-width: 1024px) min(50vw, 36rem), 100vw"
          className="object-cover object-center"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6 sm:gap-7 sm:p-8">{children}</div>
    </Panel>
  );
}

function SetupCardIntro({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1.5">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {/* Fixed 2-line subtitle height so both cards align the next section horizontally. */}
      <p className="min-h-[3rem] text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

export function DashboardSetupPanel({ canInvite = true }: { canInvite?: boolean }) {
  const router = useRouter();
  const invalidateAppData = useInvalidateAppData();
  const [machineConnected, setMachineConnected] = useState(false);
  const [enrollStatus, setEnrollStatus] = useState<string | null>(null);
  const connectCardRef = useRef<DeviceConnectCardHandle>(null);

  return (
    <div className={canInvite ? "grid gap-6 lg:grid-cols-2 lg:gap-8" : "max-w-xl"}>
      <SetupCard imageSrc="/images/connecting-computer.png">
        <div className="flex min-h-0 flex-1 flex-col gap-7">
          {enrollStatus ? (
            <div className="flex w-fit max-w-full items-center gap-2 border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" aria-hidden />
              <span>{enrollStatus}</span>
            </div>
          ) : null}
          <SetupCardIntro
            title="Connect this machine."
            description="Enrolls this computer under your account, installs the agent, and starts reporting your AI coding tools and usage."
          />
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <DeviceConnectCard
              ref={connectCardRef}
              compact
              pollAfterCopy
              hideInlineStatus
              onPollingStateChange={({ isPolling, waitingForTools }) => {
                if (!isPolling) {
                  setEnrollStatus(null);
                  return;
                }
                setEnrollStatus(
                  waitingForTools
                    ? "Device enrolled — waiting for tool detection…"
                    : "Waiting for enroll…",
                );
              }}
              onConnected={() => {
                setMachineConnected(true);
                setEnrollStatus(null);
                void invalidateAppData();
                router.refresh();
              }}
            />
            <div className="mt-auto flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={cn(
                  "h-9 min-w-[10.5rem] gap-1.5 rounded-none px-6 bg-background shadow-none",
                  machineConnected
                    ? "border-primary/30 text-primary hover:bg-primary/5"
                    : "border-border text-foreground hover:bg-muted/50",
                )}
                onClick={() => connectCardRef.current?.checkConnection()}
              >
                Connect
              </Button>
            </div>
          </div>
        </div>
      </SetupCard>

      {canInvite ? (
        <SetupCard imageSrc="/images/team-invite.png">
          <div className="flex min-h-0 flex-1 flex-col gap-8">
            <SetupCardIntro
              title="Invite teammates."
              description="Invite someone else to help you build out the workspace."
            />
            <InviteTeamForm
              variant="dashboard"
              onInvited={() => {
                void invalidateAppData();
                router.refresh();
              }}
            />
          </div>
        </SetupCard>
      ) : null}
    </div>
  );
}
