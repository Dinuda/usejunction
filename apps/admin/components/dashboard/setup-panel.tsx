"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DeviceConnectCard } from "@/components/onboarding/device-connect-card";
import { InviteTeamForm } from "@/components/onboarding/invite-team-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useInvalidateAppData } from "@/lib/api/client";

export function DashboardSetupPanel({ canInvite = true }: { canInvite?: boolean }) {
  const router = useRouter();
  const invalidateAppData = useInvalidateAppData();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <div className={canInvite ? "grid gap-8 lg:grid-cols-2" : "max-w-xl"}>
      <section>
        <h2 className="text-xl font-semibold tracking-tight">Connect this machine.</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Enrolls your computer under your account — configures tools, enables Claude metrics, and starts reporting.
        </p>
        <div className="mt-5">
          <DeviceConnectCard
            title="Connect command"
            description="Installs the agent and starts reporting. Expires in 15 minutes."
            onConnected={() => {
              void invalidateAppData();
              router.refresh();
            }}
          />
        </div>
      </section>
      {canInvite && (
        <section>
          <h2 className="text-xl font-semibold tracking-tight">Invite teammates.</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Share one invite link — or email it with instructions — and each teammate connects one device.
          </p>
          <div className="mt-5">
            <Button type="button" onClick={() => setInviteOpen(true)}>
              Invite teammates
            </Button>
          </div>
          <Dialog
            open={inviteOpen}
            onOpenChange={(next) => {
              setInviteOpen(next);
              if (!next) {
                setFormKey((current) => current + 1);
                void invalidateAppData();
                router.refresh();
              }
            }}
          >
            <DialogContent className="max-w-xl gap-5 sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Invite teammates.</DialogTitle>
                <DialogDescription>
                  Share the invite link (or email it). Teammates sign up or sign in, then install on their machine.
                </DialogDescription>
              </DialogHeader>
              <InviteTeamForm
                key={formKey}
                onInvited={() => {
                  void invalidateAppData();
                  router.refresh();
                }}
              />
            </DialogContent>
          </Dialog>
        </section>
      )}
    </div>
  );
}
