export function canRedeemTeamInvite(input: { allowlisted: boolean; hasPendingInvite: boolean }) {
  return input.allowlisted || input.hasPendingInvite;
}
