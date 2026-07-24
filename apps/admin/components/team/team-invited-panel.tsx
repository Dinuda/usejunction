"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ROLE_LABELS, roleDisplayLabel } from "@/components/developers/member-role-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Panel } from "@/components/panel";
import { useInvalidateAppData } from "@/lib/api/client";
import { userFacingError } from "@/lib/errors/user-facing";
import {
  ASSIGNABLE_ROLES,
  canManageSettings,
  type OrganizationRole,
} from "@/lib/rbac/permissions";

export type PendingInvite = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
};

type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

function asAssignableRole(role: string): AssignableRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(role)
    ? (role as AssignableRole)
    : "user";
}

function isInviteExpired(expiresAt: string) {
  return new Date(expiresAt).getTime() <= Date.now();
}

export function TeamInvitedPanel({ initialInvites }: { initialInvites: PendingInvite[] }) {
  const { data: session } = useSession();
  const canAssignRoles = canManageSettings(session?.user?.role as OrganizationRole | null | undefined);
  const invalidateAppData = useInvalidateAppData();
  const [invites, setInvites] = useState(initialInvites);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setInvites(initialInvites);
  }, [initialInvites]);

  async function resend(email: string) {
    setBusy(`resend:${email}`);
    const response = await fetch("/api/team/invite-link", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      toast.error(userFacingError(data.error, "Unable to resend invite."));
      return;
    }
    const result = (data.emailResults ?? [])[0] as { status?: string } | undefined;
    if (result?.status === "sent") {
      const nextExpiresAt = typeof data.expiresAt === "string" ? data.expiresAt : null;
      if (nextExpiresAt) {
        setInvites((current) =>
          current.map((invite) =>
            invite.email === email ? { ...invite, expiresAt: nextExpiresAt } : invite,
          ),
        );
      }
      toast.success(`Invite resent to ${email}.`);
      void invalidateAppData();
      return;
    }
    toast.error(userFacingError(data.error, "Unable to resend invite."));
  }

  async function revoke(email: string) {
    setBusy(`revoke:${email}`);
    const response = await fetch(`/api/team/invite-link?email=${encodeURIComponent(email)}`, {
      method: "DELETE",
    });
    const data = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      toast.error(userFacingError(data.error, "Unable to revoke invite."));
      return;
    }
    setInvites((current) => current.filter((invite) => invite.email !== email));
    toast.success(`Revoked invite for ${email}.`);
    void invalidateAppData();
  }

  async function changeRole(email: string, role: AssignableRole) {
    setBusy(`role:${email}`);
    const response = await fetch("/api/team/invite-link", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      toast.error(userFacingError(data.error, "Unable to update role."));
      return;
    }
    setInvites((current) =>
      current.map((invite) => (invite.email === email ? { ...invite, role: data.role ?? role } : invite)),
    );
    void invalidateAppData();
  }

  return (
    <Panel as="section" padded={false}>
      <div className="border-b bg-muted/25 px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">Invited members.</h2>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {invites.length
            ? `${invites.length} pending · resend or revoke anytime`
            : "People you invite show up here until they join."}
        </p>
      </div>

      {!invites.length ? (
        <Empty className="min-h-0 gap-1 border-0 px-5 py-6 md:px-5 md:py-6">
          <EmptyDescription>No pending invites. Use Invite teammates to send one.</EmptyDescription>
        </Empty>
      ) : (
        <ul className="divide-y">
          {invites.map((invite) => {
            const expired = isInviteExpired(invite.expiresAt);
            const resending = busy === `resend:${invite.email}`;
            const revoking = busy === `revoke:${invite.email}`;
            const savingRole = busy === `role:${invite.email}`;
            const currentRole = asAssignableRole(invite.role);
            return (
              <li key={invite.id} className="flex flex-wrap items-start gap-3 px-5 py-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium tracking-tight">{invite.email}</p>
                    {expired ? (
                      <Badge
                        variant="outline"
                        className="shrink-0 border-destructive/30 bg-destructive/10 font-normal text-destructive"
                      >
                        Expired
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Invited {new Date(invite.createdAt).toLocaleDateString()} ·{" "}
                    {expired ? "expired" : "expires"}{" "}
                    {new Date(invite.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                {canAssignRoles ? (
                  <Select
                    value={currentRole}
                    onValueChange={(next) => void changeRole(invite.email, next as AssignableRole)}
                    disabled={Boolean(busy)}
                  >
                    <SelectTrigger
                      className="h-8 w-[120px] shrink-0 self-start rounded-none"
                      aria-label={`Role for ${invite.email}`}
                    >
                      {savingRole ? <Loader2 className="size-3.5 animate-spin" /> : <SelectValue />}
                    </SelectTrigger>
                    <SelectContent>
                      {ASSIGNABLE_ROLES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {ROLE_LABELS[item]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline" className="shrink-0 self-start">
                    {roleDisplayLabel(invite.role)}
                  </Badge>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 self-start rounded-none"
                  disabled={Boolean(busy)}
                  onClick={() => void resend(invite.email)}
                >
                  {resending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                  Resend
                </Button>
                {!expired ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 self-start rounded-none px-2.5"
                    disabled={Boolean(busy)}
                    aria-label={`Revoke invite for ${invite.email}`}
                    onClick={() => void revoke(invite.email)}
                  >
                    {revoking ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
