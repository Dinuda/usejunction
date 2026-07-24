"use client";

import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RouteAction =
  | { label: string; href: string; onClick?: never }
  | { label: string; onClick: () => void; href?: never };

type SystemRouteScreenProps = {
  title: string;
  description: string;
  detail?: string;
  statement?: string;
  primary: RouteAction;
  secondary?: RouteAction;
};

function ActionButton({
  action,
  variant,
}: {
  action: RouteAction;
  variant: "default" | "outline";
}) {
  if (action.href) {
    return (
      <Button asChild variant={variant} className="w-full sm:w-auto">
        <Link href={action.href}>{action.label}</Link>
      </Button>
    );
  }

  return (
    <Button type="button" variant={variant} className="w-full sm:w-auto" onClick={action.onClick}>
      {action.label}
    </Button>
  );
}

export function SystemRouteScreen({
  title,
  description,
  detail,
  statement = "Visibility before control.",
  primary,
  secondary,
}: SystemRouteScreenProps) {
  return (
    <AuthShell
      size="md"
      accent="cyan"
      contentAlign="top"
      title={title}
      description={description}
      statement={statement}
    >
      {detail ? <p className="text-sm leading-6 text-muted-foreground">{detail}</p> : null}

      <div className={cn("flex flex-col gap-3 sm:flex-row", detail ? "mt-6" : undefined)}>
        <ActionButton action={primary} variant="default" />
        {secondary ? <ActionButton action={secondary} variant="outline" /> : null}
      </div>
    </AuthShell>
  );
}
