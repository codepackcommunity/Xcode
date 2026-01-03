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
  title: "KM Electronics",
  description: "Your Ultimate Phone Plug | Developed By Codepack",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="portrait-container">
          <div className="landscape-warning">
            <h2>Please Rotate Your Device</h2>
            <p>For the best experience, please use portrait mode on this device.</p>
          </div>
          <div className="main-content">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}