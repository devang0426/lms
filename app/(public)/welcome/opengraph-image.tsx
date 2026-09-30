import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { institute } from "@/lib/institute";

/* The landing page's share image (feature 34), made once at build time:
   the hero's Clay panel with the institute's name and the headline.

   ImageResponse can't read CSS variables, so the token values are copied
   here from ui-context.md → Core palette. Instrument Serif comes from
   assets/fonts (OFL, see its licence file); other text uses next/og's
   built-in Geist. */

export const alt = "Studyhall: lectures you can ask questions of.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const token = {
  cream: "#FBF8F3", // --bg-base
  clay: "#F6E2D6", // --accent-tint
  terracotta: "#B84F26", // --accent-primary
  ink: "#221E19", // --text-primary
  clayInk: "#8E3C1C", // --accent-ink
  butter: "#E9B949", // --state-warning
  sageTint: "#E2ECE1", // --state-success-bg
};

const fontDir = join(process.cwd(), "assets", "fonts", "instrument-serif");

export default async function OpenGraphImage() {
  const { name } = institute();
  const [serif, serifItalic] = await Promise.all([
    readFile(join(fontDir, "InstrumentSerif-Regular.ttf")),
    readFile(join(fontDir, "InstrumentSerif-Italic.ttf")),
  ]);

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", padding: 28, background: token.cream }}>
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            padding: "56px 64px",
            borderRadius: 28,
            overflow: "hidden",
            background: token.clay,
            color: token.ink,
          }}
        >
          <div style={{ position: "absolute", top: -120, right: -110, width: 460, height: 460, borderRadius: 9999, background: token.butter, opacity: 0.55 }} />
          <div style={{ position: "absolute", bottom: -90, right: 260, width: 240, height: 240, borderRadius: 9999, background: token.sageTint }} />

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 52,
                height: 52,
                borderRadius: 13,
                background: token.terracotta,
                color: token.cream,
                fontFamily: "Instrument Serif",
                fontStyle: "italic",
                fontSize: 36,
              }}
            >
              s
            </div>
            <div style={{ display: "flex", fontFamily: "Instrument Serif", fontSize: 38 }}>Studyhall</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ display: "flex", fontSize: 22, letterSpacing: "0.12em", textTransform: "uppercase", color: token.clayInk }}>{name}</div>
            <div style={{ display: "flex", flexDirection: "column", fontFamily: "Instrument Serif", fontSize: 104, lineHeight: 0.96, letterSpacing: "-0.02em" }}>
              <span>Lectures you can</span>
              <span style={{ fontStyle: "italic", color: token.terracotta }}>ask questions of.</span>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Instrument Serif", data: serif, style: "normal", weight: 400 },
        { name: "Instrument Serif", data: serifItalic, style: "italic", weight: 400 },
      ],
    },
  );
}
