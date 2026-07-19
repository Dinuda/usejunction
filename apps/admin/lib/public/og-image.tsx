import { ImageResponse } from "next/og";

export const ogSize = { width: 1200, height: 630 };

export function renderOgImage(opts: { title: string; subtitle?: string }) {
  const title = opts.title.length > 90 ? `${opts.title.slice(0, 87)}…` : opts.title;
  const subtitle = opts.subtitle ?? "Open-source observability for AI coding tools";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px",
          background: "linear-gradient(145deg, #fafaf7 0%, #dceef1 48%, #fafaf7 100%)",
          color: "#111210",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              background: "#F7F703",
              opacity: 0.85,
              transform: "rotate(45deg)",
            }}
          />
          UseJunction
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 980 }}>
          <div
            style={{
              fontSize: title.length > 60 ? 48 : 56,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 26, color: "#075e6d", lineHeight: 1.35, maxWidth: 860 }}>{subtitle}</div>
        </div>
        <div style={{ fontSize: 22, color: "#06697c" }}>usejunction.dev</div>
      </div>
    ),
    { ...ogSize },
  );
}
