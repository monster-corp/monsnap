import {NextResponse} from "next/server";
import {ERROR, statusFromCode, type ErrorKey} from "./error-codes";

export function respondWithStatus<T>(
    key: ErrorKey,
    data: T | null = null,
    overrideMessage?: string
) {
    const {code, message} = ERROR[key];
    return NextResponse.json(
        {code, message: overrideMessage ?? message, data},
        {status: statusFromCode(code)}
    );
}

export * from "./error-codes";
