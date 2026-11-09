import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Daily Quip — prompt chains",
  description: "Build, reorder and run the prompt chains behind Daily Quip",
  robots: { index: false, follow: false },
};

/**
 * Runs before first paint, so a forced theme never flashes the other one.
 * Deliberately tiny and defensive: `localStorage` throws in a private window
 * with site data blocked, and the right answer there is "fall back to the OS",
 * not "break the page".
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light"){document.documentElement.dataset.theme=t}}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // The inline script sets data-theme on the client only, which the server
      // render cannot know about.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
