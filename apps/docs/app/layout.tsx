import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Banner, Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import { Footer, Layout, Navbar } from "nextra-theme-docs";

import "nextra-theme-docs/style.css";
import "./globals.css";

import Image from "next/image";

type RootLayoutProps = {
  children: ReactNode;
};

export const metadata: Metadata = {
  title: "WatchAPI Docs",
  description: "Product documentation for the WatchAPI monitoring platform.",
  icons: {
    icon: [
      { url: "/favicon.png" },
      {
        url: "/favicon-light.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/favicon-dark.png",
        media: "(prefers-color-scheme: dark)",
      },
    ],
  },
};

const navbar = (
  <Navbar
    logo={<Logo />}
    projectLink="https://github.com/watchapi"
    chatLink="https://discord.gg/5bANxHbfNx"
  />
);
const footer = (
  <Footer>
    <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-500 justify-between w-full">
      <div className="flex items-center gap-2">
        <Logo compact />
        <span>© {new Date().getFullYear()} WatchAPI</span>
      </div>
      <div className="flex items-center gap-4">
        <a href="https://watchapi.dev" className="hover:text-inherit">
          Home
        </a>
        <a
          rel="nofollow noreferrer noopener"
          target="_blank"
          href="https://stats.uptimerobot.com/O0uUSDGYUC"
          className="hover:text-inherit"
        >
          Status
        </a>
        <a href="mailto:support@watchapi.dev" className="hover:text-inherit">
          Contact
        </a>
      </div>
    </div>
  </Footer>
);

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap font-semibold text-inherit leading-tight">
      <Image
        src="/logo.png"
        alt="WatchAPI logo"
        width={28}
        height={28}
        className="block h-7 w-7 shrink-0 object-contain"
      />
      {!compact && <span className="leading-tight">WatchAPI</span>}
    </span>
  );
}

export default async function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          search={false}
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/watchapi/watchapi-docs/tree/main/"
          footer={footer}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
