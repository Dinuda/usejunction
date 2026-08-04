export function isPersonCovered(input: {
  assignment: { id: string } | null;
  vendorPlan: string | null;
  hasUsage: boolean;
}): boolean {
  if (input.assignment) return true;
  if (input.vendorPlan?.trim()) return true;
  return input.hasUsage;
}

export function peopleKpiSubline(peopleCovered: number, peopleInstallOnly: number): string {
  if (peopleInstallOnly > 0) {
    return `${peopleCovered} with plans · ${peopleInstallOnly} install only`;
  }
  return "With plan or usage";
}
