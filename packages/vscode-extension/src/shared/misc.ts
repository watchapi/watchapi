import {
    RequestHeaders,
    RequestHeaderValue,
    ResponseHeaders,
    ResponseHeaderValue,
} from "./base";

export function getHeader(
    headers: ResponseHeaders,
    name: string,
): ResponseHeaderValue;
export function getHeader(
    headers: RequestHeaders,
    name: string,
): RequestHeaderValue;
export function getHeader(
    headers: RequestHeaders | ResponseHeaders,
    name: string,
): RequestHeaderValue | ResponseHeaderValue {
    if (!headers || !name) {
        return undefined;
    }

    const headerName = Object.keys(headers).find(
        (h) => h.toLowerCase() === name.toLowerCase(),
    );
    return headerName && headers[headerName];
}

export function getContentType(
    headers: RequestHeaders | ResponseHeaders,
): string | undefined {
    const value = getHeader(headers, "content-type");
    return value?.toString();
}

export function hasHeader(
    headers: RequestHeaders | ResponseHeaders,
    name: string,
): boolean {
    return !!(
        headers &&
        name &&
        Object.keys(headers).some((h) => h.toLowerCase() === name.toLowerCase())
    );
}

export function formatHeaders(
    headers: RequestHeaders | ResponseHeaders,
): string {
    let headerString = "";
    for (const header in headers) {
        if (Object.hasOwn(headers, header)) {
            let value = headers[header];
            // Handle set-cookie as a special case since multiple entries
            // should appear as their own header. For example:
            //     set-cookie: a=b
            //     set-cookie: c=d
            // Not:
            //     set-cookie: a=b,c=d
            if (header.toLowerCase() === "set-cookie") {
                if (typeof value === "string") {
                    value = [value];
                }
                for (const cookie of <Array<string>>value) {
                    headerString += `${header}: ${cookie}\n`;
                }
            } else {
                headerString += `${header}: ${value}\n`;
            }
        }
    }
    return headerString;
}
