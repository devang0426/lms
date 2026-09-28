import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Toaster } from "@/components/ui/overlay";
import { clerkAppearance } from "@/lib/auth/appearance";
import "./globals.css";

/* Font variables are mapped to font-sans / font-serif / font-mono in
   globals.css (@theme). They use a -src suffix so the theme tokens don't
   reference themselves. */
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

export const metadata: Metadata = {
  title: "Studyhall",
  description: "Warm, light & unhurried learning.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full`}
    >
      <body className="min-h-full bg-page font-sans text-body text-ink antialiased">
        <ClerkProvider
          appearance={clerkAppearance}
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
        >
          {children}
          <Toaster />
        </ClerkProvider>
      </body>
    </html>
  );
}
