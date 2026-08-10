import { ImageResponse } from "next/og";
import { GloriaWordmark } from "@/components/brand/gloria-wordmark";

export const alt =
  "Uniformes escolares en Ledesma, Jujuy para primaria y secundaria";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        padding: "72px",
        background: "#f8fbed",
        color: "#16200f",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 420,
          height: 420,
          right: -100,
          top: -120,
          borderRadius: 999,
          background: "#a8d829",
          opacity: 0.34,
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", color: "#16200f" }}>
          <GloriaWordmark width={260} height={84} title="Pilchería Gloria" />
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              color: "#52730f",
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Libertador · Ledesma · Jujuy
          </div>
          <div
            style={{
              display: "flex",
              maxWidth: 900,
              marginTop: 20,
              fontSize: 72,
              fontWeight: 900,
              lineHeight: 0.98,
              letterSpacing: "-0.045em",
            }}
          >
            Uniformes escolares para primaria y secundaria
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 24,
              fontSize: 28,
              color: "#486139",
            }}
          >
            Remeras · Camisas · Pantalones · Medias · Todos los talles
          </div>
        </div>
      </div>
    </div>,
    size
  );
}
