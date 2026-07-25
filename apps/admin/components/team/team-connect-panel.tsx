"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Plus, UserPlus, X } from "lucide-react";
import { DeviceConnectCard } from "@/components/onboarding/device-connect-card";
import { InviteTeamForm } from "@/components/onboarding/invite-team-form";
import { useBillingNavigation } from "@/components/saas-billing/use-billing-navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAppQuery, useInvalidateAppData } from "@/lib/api/client";
import { workspaceContextKey } from "@/lib/app-pages/query-keys";
import type { OrgBillingStatus } from "@/lib/saas-billing/status";

type WorkspaceContextBilling = {
  billing: OrgBillingStatus | null;
};

function InviteUserLimitBody({ billing }: { billing: OrgBillingStatus }) {
  const { error, loading, openCheckout } = useBillingNavigation();
  const limit = billing.usersLimit ?? 5;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-6 text-muted-foreground">
        Community includes up to {limit} users. Upgrade to Team to invite more.
      </p>
      {billing.canUpgrade ? (
        <div className="flex flex-col gap-2">
          <Button type="button" className="before:content-none" disabled={loading} onClick={openCheckout}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Upgrade to Team"}
            {!loading && <ArrowRight className="size-4" />}
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Ask a workspace admin to upgrade to Team.</p>
      )}
    </div>
  );
}

export function InvitePeopleDialog() {
  const router = useRouter();
  const invalidateAppData = useInvalidateAppData();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const contextQuery = useAppQuery<WorkspaceContextBilling>(
    workspaceContextKey,
    "/api/app/workspace-context",
  );
  const billing = contextQuery.data?.billing;
  const atUserLimit = billing?.isAtUserLimit ?? false;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setFormKey((current) => current + 1);
          void invalidateAppData();
          router.refresh();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">
          <UserPlus />
          Invite teammates
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="w-full max-w-xl gap-0 overflow-hidden p-0 sm:max-w-xl sm:p-0">
        <div className="relative h-40 w-full shrink-0 overflow-hidden border-b border-border bg-muted" aria-hidden>
          <Image
            src="/images/team-invite.png"
            alt=""
            fill
            sizes="(min-width: 640px) 36rem, 100vw"
            className="object-cover object-center"
            priority
          />
        </div>
        <DialogClose className="absolute top-3 right-3 z-10 rounded-md bg-background/80 p-1.5 text-foreground opacity-80 shadow-sm backdrop-blur-sm transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:outline-hidden">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogClose>
        <div className="flex w-full min-w-0 flex-col gap-5 px-5 py-5 sm:gap-6 sm:px-6 sm:py-6">
          {atUserLimit && billing ? (
            <>
              <DialogHeader className="gap-1.5 space-y-0">
                <DialogTitle className="text-xl font-semibold tracking-tight">Invite teammates.</DialogTitle>
                <DialogDescription className="text-sm leading-6">
                  Your workspace is at the Community user limit.
                </DialogDescription>
              </DialogHeader>
              <InviteUserLimitBody billing={billing} />
            </>
          ) : (
            <InviteTeamForm
              key={formKey}
              variant="dashboard"
              renderHeader={(copyLink) => (
                <DialogHeader className="gap-1.5 space-y-0">
                  <div className="flex items-center justify-between gap-3">
                    <DialogTitle className="text-xl font-semibold tracking-tight">Invite teammates.</DialogTitle>
                    {copyLink}
                  </div>
                  <DialogDescription className="text-sm leading-6">
                    Invite someone else to help you build out the workspace.
                  </DialogDescription>
                </DialogHeader>
              )}
              onInvited={() => {
                void invalidateAppData();
                router.refresh();
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EnrollMachineDialog() {
  const router = useRouter();
  const invalidateAppData = useInvalidateAppData();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="icon-sm" aria-label="Connect my machine">
          <Plus />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl gap-5 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Connect my machine.</DialogTitle>
          <DialogDescription>
            Enrolls this computer under your account. Expires in 15 minutes.
          </DialogDescription>
        </DialogHeader>
        <DeviceConnectCard
          compact
          title="Connect command"
          description="Installs the agent and starts reporting."
          onConnected={() => {
            void invalidateAppData();
            router.refresh();
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
