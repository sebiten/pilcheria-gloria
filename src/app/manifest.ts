import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pilchería Gloria",
    short_name: "Gloria",
    description:
      "Uniformes escolares en Libertador General San Martín, Ledesma, Jujuy.",
    start_url: "/",
    id: "/",
    display: "standalone",
    background_color: "#f8fbed",
    theme_color: "#a8d829",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
