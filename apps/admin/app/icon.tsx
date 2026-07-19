import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fafaf7",
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            background: "#F7F703",
            opacity: 0.85,
            transform: "rotate(45deg)",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
