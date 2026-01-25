import type { Metadata } from "next";
import { RootProvider } from "fumadocs-ui/provider/next";
import "./global.css";
import { Inter } from "next/font/google";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { source } from "@/lib/source";
import { baseOptions } from "@/lib/layout.shared";

const inter = Inter({
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "WatchAPI Docs",
    description: "WatchAPI documentation",
    icons: {
        icon: [
            { url: "/favicon.png" },
            { url: "/favicon-dark.png", media: "(prefers-color-scheme: dark)" },
            { url: "/favicon-light.png", media: "(prefers-color-scheme: light)" },
        ],
    },
};

export default function Layout({ children }: LayoutProps<"/">) {
    return (
        <html lang="en" className={inter.className} suppressHydrationWarning>
            <body className="flex flex-col min-h-screen">
                <RootProvider>
                    <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
                        {children}
                    </DocsLayout>
                </RootProvider>
            </body>
        </html>
    );
}
