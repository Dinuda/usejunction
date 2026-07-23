"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Plus, UserPlus, X } from "lucide-react";
import { DeviceConnectCard } from "@/components/onboarding/device-connect-card";
import { InviteTeamForm } from "@/components/onboarding/invite-team-form";
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
import { useInvalidateAppData } from "@/lib/api/client";

export function InvitePeopleDialog() {
  const router = useRouter();
  const invalidateAppData = useInvalidateAppData();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

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
          <DialogHeader className="gap-1.5 space-y-0">
            <DialogTitle className="text-xl font-semibold tracking-tight">Invite teammates.</DialogTitle>
            <DialogDescription className="text-sm leading-6">
              Invite someone else to help you build out the workspace.
            </DialogDescription>
          </DialogHeader>
          <InviteTeamForm
            key={formKey}
            variant="dashboard"
            onInvited={() => {
              void invalidateAppData();
              router.refresh();
            }}
          />
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
