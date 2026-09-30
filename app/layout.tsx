import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { PendingBar } from "@/components/shell/pending-bar";
import { TimeZoneCookie } from "@/components/shell/time-zone-cookie";
import { Toaster } from "@/components/ui/overlay";
import { clerkAppearance } from "@/lib/auth/appearance";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Studyhall",
  description: "Warm, light & unhurried learning.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fontVariables} h-full`}>
      <body className="min-h-full bg-page font-sans text-body text-ink antialiased">
        <ClerkProvider
          appearance={clerkAppearance}
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
        >
          <PendingBar />
          {children}
          <Toaster />
          <TimeZoneCookie />
        </ClerkProvider>
      </body>
    </html>
  );
}
