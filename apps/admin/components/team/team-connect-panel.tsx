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

export function InvitePeopleDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setFormKey((current) => current + 1);
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
            router.refresh();
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
          forceEnroll
          title="Connect command"
          description="Installs the agent and starts reporting."
          onConnected={() => {
            router.refresh();
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
