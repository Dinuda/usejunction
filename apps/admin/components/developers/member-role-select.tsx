"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ASSIGNABLE_ROLES, type OrganizationRole } from "@/lib/rbac/permissions";
import { userFacingError } from "@/lib/errors/user-facing";

const ROLE_LABELS: Record<(typeof ASSIGNABLE_ROLES)[number], string> = {
  admin: "Admin",
  manager: "Manager",
  user: "User",
};

export function MemberRoleSelect({
  developerId,
  role,
}: {
  developerId: string;
  role: string;
}) {
  const router = useRouter();
  const locked = role === "owner";
  const current = (ASSIGNABLE_ROLES as readonly string[]).includes(role)
    ? (role as (typeof ASSIGNABLE_ROLES)[number])
    : "user";
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: string) {
    if (locked || next === value) return;
    setSaving(true);
    setError(null);
    const response = await fetch(`/api/developers/${developerId}/role`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: next }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(userFacingError(body.error, "Could not update role."));
      setSaving(false);
      return;
    }
    setValue(next as (typeof ASSIGNABLE_ROLES)[number]);
    setSaving(false);
    router.refresh();
  }

  if (locked) {
    return (
      <p className="text-sm text-muted-foreground">
        Role · <span className="font-medium text-foreground">Owner</span>
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Role</span>
        <Select value={value} onValueChange={onChange} disabled={saving}>
          <SelectTrigger className="h-8 w-[140px] rounded-none" aria-label="Member role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASSIGNABLE_ROLES.map((item) => (
              <SelectItem key={item} value={item}>
                {ROLE_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function roleDisplayLabel(role: OrganizationRole | string): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  if (role === "manager") return "Manager";
  if (role === "user") return "User";
  return role;
}
