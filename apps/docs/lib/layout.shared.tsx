import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import Image from "next/image";

export function baseOptions(): BaseLayoutProps {
    return {
        nav: {
            title: (
                <>
                    <Image
                        src="/favicon-light.png"
                        alt="WatchAPI"
                        width={24}
                        height={24}
                        className="block dark:hidden"
                    />
                    <Image
                        src="/favicon-dark.png"
                        alt="WatchAPI"
                        width={24}
                        height={24}
                        className="hidden dark:block"
                    />
                    <span>WatchAPI</span>
                </>
            ),
        },
    };
}
