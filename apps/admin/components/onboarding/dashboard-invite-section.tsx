"use client";

import { useCallback, useEffect, useState } from "react";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { InviteTeamForm } from "@/components/onboarding/invite-team-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Invite = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  acceptedAt?: string | null;
};

export function DashboardInviteSection({
  inviteTitle = "Invite your team",
  inviteDescription = "Add developer emails and we\u2019ll send each person a secure link. They sign in, run one command, and they\u2019re done.",
  className,
}: {
  inviteTitle?: string;
  inviteDescription?: string | null;
  className?: string;
}) {
  const [invites, setInvites] = useState<Invite[]>([]);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/organizations/invites", { cache: "no-store" });
    if (response.ok) setInvites((await response.json()).invites ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className={cn("grid gap-5 lg:grid-cols-[1fr_0.9fr]", className)}>
      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle>{inviteTitle}</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {inviteDescription ? (
            <p className="mb-5 text-sm text-muted-foreground">{inviteDescription}</p>
          ) : null}
          <InviteTeamForm onInvited={() => void refresh()} />
        </CardContent>
      </Card>
      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle>Recent invitations</CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {invites.length ? (
            invites.slice(0, 8).map((invite) => (
              <div key={invite.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="text-sm font-medium">{invite.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Expires {new Date(invite.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={invite.acceptedAt ? "border-green-200 bg-green-50 text-green-800" : ""}
                >
                  {invite.acceptedAt ? "Joined" : "Invited"}
                </Badge>
              </div>
            ))
          ) : (
            <Empty className="min-h-0 gap-1 border-0 p-5 md:p-5">
              <EmptyDescription>No invitations yet.</EmptyDescription>
            </Empty>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
