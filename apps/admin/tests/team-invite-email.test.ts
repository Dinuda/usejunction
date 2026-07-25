import { describe, expect, it } from "vitest";
import { buildTeamInviteEmailDocument } from "@/lib/email/team-invite-html";

describe("buildTeamInviteEmailDocument", () => {
  it("renders a transactional invite with inviter and CTA", () => {
    const doc = buildTeamInviteEmailDocument({
      organizationName: "Dinuda Yaggahavita workspace",
      inviteUrl: "https://app.usejunction.dev/i/abc123",
      recipientEmail: "teammate@example.com",
      invitedBy: { name: "Dinuda Yaggahavita", email: "dinuda@example.com" },
      appOrigin: "https://app.usejunction.dev",
    });

    expect(doc.subject).toBe("Join Dinuda Yaggahavita's workspace on UseJunction");
    expect(doc.logoUrl).toBe("https://app.usejunction.dev/usejunction.png");
    expect(doc.html).toContain("Accept invite");
    expect(doc.html).toContain("Dinuda Yaggahavita's workspace");
    expect(doc.html).toContain("Dinuda Yaggahavita");
    expect(doc.html).toContain("dinuda@example.com");
    expect(doc.html).toContain("teammate@example.com");
    expect(doc.html).toContain('href="https://app.usejunction.dev/i/abc123"');
    expect(doc.html).not.toContain("What is UseJunction?");
    expect(doc.html).not.toContain("Learn more");
    expect(doc.html).not.toContain("Made by UseJunction");
    expect(doc.html).not.toContain("team-invite.png");
    expect(doc.html).not.toContain("Join Now");
    expect(doc.html).not.toContain("background-color:#f4f7a8");
    expect(doc.html).not.toContain("localhost");
    expect(doc.text).toContain("https://app.usejunction.dev/i/abc123");
    expect(doc.text).toContain(
      "Dinuda Yaggahavita (dinuda@example.com) has invited you to join Dinuda Yaggahavita's workspace",
    );
    expect(doc.text).not.toContain("What is UseJunction?");
  });

  it("falls back when inviter is missing", () => {
    const doc = buildTeamInviteEmailDocument({
      organizationName: "Acme",
      inviteUrl: "https://app.usejunction.dev/i/x",
      recipientEmail: "a@b.com",
      appOrigin: "https://app.usejunction.dev",
    });

    expect(doc.html).toContain("You've been invited to join <strong>Acme</strong>");
    expect(doc.text).toContain("You've been invited to join Acme on UseJunction.");
  });

  it("escapes workspace names in HTML", () => {
    const doc = buildTeamInviteEmailDocument({
      organizationName: `Acme <script>alert("x")</script>`,
      inviteUrl: "https://app.usejunction.dev/i/x",
      recipientEmail: "a@b.com",
      appOrigin: "https://app.usejunction.dev",
    });

    expect(doc.html).not.toContain("<script>");
    expect(doc.html).toContain("Acme &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });

  it("uses cid URLs when inlineAssets is enabled", () => {
    const doc = buildTeamInviteEmailDocument({
      organizationName: "Acme",
      inviteUrl: "https://app.usejunction.dev/i/x",
      recipientEmail: "a@b.com",
      appOrigin: "https://app.usejunction.dev",
      inlineAssets: true,
    });

    expect(doc.logoUrl).toBe("cid:uj-logo");
    expect(doc.html).toContain('src="cid:uj-logo"');
    expect(doc.html).not.toContain("cid:uj-team-invite-hero");
  });

  it("formats trailing workspace as possessive", () => {
    const doc = buildTeamInviteEmailDocument({
      organizationName: "Acme Labs workspace",
      inviteUrl: "https://app.usejunction.dev/i/x",
      recipientEmail: "a@b.com",
      appOrigin: "https://app.usejunction.dev",
    });

    expect(doc.subject).toBe("Join Acme Labs's workspace on UseJunction");
    expect(doc.html).toContain("Acme Labs's workspace");
    expect(doc.html).not.toContain("Acme Labs workspace on UseJunction");
  });
});
