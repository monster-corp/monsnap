import {cache} from "react";
import {cookies} from "next/headers";
import {prisma} from "@/lib/prisma";

export const ANON_TOKEN_COOKIE = "anon_token";

/** 쿠키의 anon_token으로 현재 요청의 유저 ID를 조회. 세션 없으면 null, DB 오류는 그대로 throw. */
export const getCurrentUserId = cache(async (): Promise<bigint | null> => {
    const cookieStore = await cookies();
    const token = cookieStore.get(ANON_TOKEN_COOKIE)?.value;
    if (!token) {
        return null;
    }

    const user = await prisma.user.findUnique({
        where: {anonToken: token},
        select: {id: true},
    });

    return user?.id ?? null;
});