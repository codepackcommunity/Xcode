import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: false,
  devIndicators: false,
  pageExtensions: ['(?<!\\.test\\.)ts', '(?<!\\.test\\.)tsx', '(?<!\\.test\\.)js', '(?<!\\.test\\.)jsx'],

};

export default nextConfig;
