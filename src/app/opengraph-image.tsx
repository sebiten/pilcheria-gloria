import { ImageResponse } from "next/og";
import { GloriaWordmark } from "@/components/brand/gloria-wordmark";

export const alt =
  "Pilchería Gloria, uniformes escolares en Ledesma, Jujuy";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          background: "#f8fbed",
          color: "#15210c",
          padding: 72,
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 520,
            height: 520,
            right: -130,
            top: -120,
            borderRadius: 999,
            background: "#ddee9d",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 820 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              color: "#15210c",
            }}
          >
            <div
              style={{
                display: "flex",
                paddingLeft: 4,
                marginBottom: 4,
                fontSize: 17,
                fontWeight: 800,
                letterSpacing: 7,
                color: "#2f5b16",
              }}
            >
              PILCHERÍA
            </div>
            <GloriaWordmark width={264} height={85} />
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 42,
              fontSize: 78,
              lineHeight: 0.98,
              fontWeight: 900,
              letterSpacing: -4,
            }}
          >
            El uniforme de tu escuela.
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 32,
              fontSize: 27,
              color: "#486139",
            }}
          >
            Uniformes escolares · Ledesma, Jujuy
          </div>
        </div>
      </div>
    ),
    size
  );
}
