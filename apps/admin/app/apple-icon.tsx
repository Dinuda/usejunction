import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#08758a",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            background: "#F7F703",
            opacity: 0.9,
            transform: "rotate(45deg)",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
