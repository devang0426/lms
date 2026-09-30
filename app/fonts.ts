import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";

/* Font variables are mapped to font-sans / font-serif / font-mono in
   globals.css (@theme). They use a -src suffix so the theme tokens don't
   reference themselves. Shared by the root layout and global-error.tsx,
   which replaces it (feature 30). */
const geist = Geist({
  variable: "--font-geist-src",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono-src",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif-src",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

/* For <html className>. */
export const fontVariables = `${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`;
