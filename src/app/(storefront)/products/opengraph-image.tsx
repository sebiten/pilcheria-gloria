import { ImageResponse } from "next/og";
import { GloriaWordmark } from "@/components/brand/gloria-wordmark";
import { FACEBOOK_PROMOTION } from "@/lib/promotions";
import { getFacebookPromotionAvailability } from "@/lib/promotions-server";

export const alt =
  "Uniformes para varias escuelas, con stock por talle, en Pilchería Gloria";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function OpenGraphImage() {
  const promotion = await getFacebookPromotionAvailability();

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        background: "#12170d",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
        padding: "42px 54px 38px",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 470,
          height: 470,
          right: -180,
          top: -250,
          borderRadius: 999,
          border: "64px solid rgba(168,216,41,0.18)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 240,
          height: 240,
          left: -130,
          bottom: -155,
          borderRadius: 999,
          background: "rgba(168,216,41,0.12)",
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", color: "white" }}>
          <GloriaWordmark width={225} height={70} title="Pilchería Gloria" />
        </div>
        <div
          style={{
            display: "flex",
            borderRadius: 999,
            background: "#a8d829",
            color: "#17210f",
            padding: "11px 20px",
            fontSize: 20,
            fontWeight: 900,
            letterSpacing: 0.6,
          }}
        >
          UNIFORMES ESCOLARES · LEDESMA
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "stretch",
          gap: 34,
          marginTop: 28,
          position: "relative",
        }}
      >
        <div
          style={{
            width: 700,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              color: "#badd63",
              fontSize: 25,
              fontWeight: 900,
              letterSpacing: 2.2,
            }}
          >
            REMERAS Y CHOMBAS
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 8,
              fontSize: 66,
              lineHeight: 0.92,
              fontWeight: 900,
              letterSpacing: -3,
            }}
          >
            <span>Uniformes para</span>
            <span style={{ color: "#a8d829" }}>varias escuelas</span>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 24,
              maxWidth: 650,
              color: "#d6dccf",
              fontSize: 27,
              lineHeight: 1.25,
            }}
          >
            Si tu escuela o talle no aparece online, consultanos: en el negocio
            tenemos más opciones.
          </div>
        </div>

        <div
          style={{
            width: 365,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            borderRadius: 28,
            background: "#f7f8f2",
            color: "#17210f",
            padding: "28px 30px",
            boxShadow: "0 20px 50px rgba(0,0,0,0.22)",
          }}
        >
          <div
            style={{
              display: "flex",
              color: "#55782b",
              fontSize: 19,
              fontWeight: 900,
              letterSpacing: 1.6,
            }}
          >
            PRECIOS ONLINE
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 5,
              fontSize: 42,
              fontWeight: 900,
              letterSpacing: -1.5,
            }}
          >
            $20.000 · $25.000
          </div>
          {[
            "Stock visible por talle",
            "Compra segura con Mercado Pago",
            "Envío local gratis desde 2 prendas",
            "Retiro coordinado en Ledesma",
          ].map((item) => (
            <div
              key={item}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginTop: 17,
                fontSize: 20,
                fontWeight: 700,
              }}
            >
              <span
                style={{
                  display: "flex",
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: "#86b91e",
                }}
              />
              {item}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          minHeight: 78,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          borderRadius: 22,
          background: promotion.available ? "#a8d829" : "#eef4df",
          color: "#17210f",
          padding: "15px 24px",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 16,
          }}
        >
          <span style={{ fontSize: 28, fontWeight: 900 }}>
            {promotion.available
              ? "$3.000 de descuento"
              : "Buscá tu escuela y talle"}
          </span>
          {promotion.available ? (
            <span style={{ fontSize: 19, fontWeight: 700 }}>
              Primeras {FACEBOOK_PROMOTION.maxUses} compras
            </span>
          ) : null}
        </div>
        <div
          style={{
            display: "flex",
            borderRadius: 12,
            background: "#17210f",
            color: "#ffffff",
            padding: "10px 17px",
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: promotion.available ? 2 : 0,
          }}
        >
          {promotion.available ? FACEBOOK_PROMOTION.code : "VER TALLES Y COMPRAR"}
        </div>
      </div>
    </div>,
    size
  );
}
