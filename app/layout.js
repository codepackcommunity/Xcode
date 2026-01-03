import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import {fav} from "./favicon.ico";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  icon: fav,
  title: "KM Electronix - Your Ultimate Phone Plug",
  description: "Your Ultimate Phone Plug | Developed By Codepack",
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
