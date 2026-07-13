"use client";

import { useCallback, useEffect, useState } from "react";
import { InviteTeamForm } from "@/components/onboarding/invite-team-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Invite = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  acceptedAt?: string | null;
};

export function DashboardInviteSection() {
  const [invites, setInvites] = useState<Invite[]>([]);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/organizations/invites", { cache: "no-store" });
    if (response.ok) setInvites((await response.json()).invites ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="mb-8 grid gap-5 lg:grid-cols-[1fr_0.9fr]">
      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle>Invite your team</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <p className="mb-5 text-sm text-muted-foreground">
            Add developer emails and we&apos;ll send each person a secure link. They sign in, run one command, and
            they&apos;re done.
          </p>
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
            <p className="p-5 text-sm text-muted-foreground">No invitations yet.</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
