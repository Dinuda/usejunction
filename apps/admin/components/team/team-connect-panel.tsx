"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserPlus } from "lucide-react";
import { DeviceConnectCard } from "@/components/onboarding/device-connect-card";
import { InviteTeamForm } from "@/components/onboarding/invite-team-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function TeamConnectPanel() {
  const router = useRouter();

  return (
    <section className="max-w-2xl">
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-primary">Connect</p>
      <h2 className="mt-3 text-xl font-semibold tracking-tight">Enroll the first machine.</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Run the command in Terminal. The machine appears here when enrollment completes.
      </p>
      <div className="mt-5">
        <DeviceConnectCard
          title="Enroll command"
          description="One curl. Expires in 15 minutes."
          onConnected={() => router.refresh()}
        />
      </div>
    </section>
  );
}

export function InvitePeopleDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setFormKey((current) => current + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">
          <UserPlus />
          Invite people
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl gap-5 sm:max-w-xl">
        <DialogHeader>
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-primary">Grow the roster</p>
          <DialogTitle>Invite people.</DialogTitle>
          <DialogDescription>
            Send a secure join link. They can connect their machine after signing in.
          </DialogDescription>
        </DialogHeader>
        <InviteTeamForm
          key={formKey}
          onInvited={({ failed }) => {
            router.refresh();
            if (failed === 0) setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function EnrollMachineDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="icon-sm" aria-label="Enroll another machine">
          <Plus />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl gap-5 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Enroll a machine.</DialogTitle>
          <DialogDescription>
            Run this on any computer. Expires in 15 minutes.
          </DialogDescription>
        </DialogHeader>
        <DeviceConnectCard
          compact
          forceEnroll
          title="Enroll command"
          description="One curl. Waiting for enroll…"
          onConnected={() => {
            router.refresh();
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
