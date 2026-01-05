import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  icon: "favicon.ico",
  title: "KM Electronix - Your Ultimate Phone Plug",
  description: "Your Ultimate Phone Plug | Developed By Cod3pack",
   keywords: ['km', 'about', 'company', 'team', 'electronics', 'electronix', 'phones', 'price'],
  openGraph: {
    title: "KM Electronix - Your Ultimate Phone Plug",
    description: "Stay Connected, Stay Ahead With KM Electronix."
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
