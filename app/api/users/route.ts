import {NextRequest} from "next/server";
import {cookies} from "next/headers";
import {z} from "zod";
import {prisma} from "@/lib/prisma";
import {ApiError, respondWithStatus} from "@/lib/api/response";
import {ANON_TOKEN_COOKIE, getCurrentUserId} from "@/lib/auth";
import {getUserProfile} from "@/lib/users";

const NICKNAME_REGEX = /^[가-힣a-zA-Z0-9]+$/;

const createUserSchema = z.object({
    nickname: z.string()
        .trim()
        .min(2)
        .max(12)
        .regex(NICKNAME_REGEX),
});

export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch (err) {
        console.error("[/api/users] JSON 파싱 실패:", err);
        return respondWithStatus("INVALID_REQUEST");
    }

    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
        return respondWithStatus("INVALID_NICKNAME");
    }

    const user = await prisma.user.create({
        data: {
            nickname: parsed.data.nickname
        },
    });

    const cookieStore = await cookies();
    cookieStore.set(ANON_TOKEN_COOKIE, user.anonToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
        path: "/"
    });

    return respondWithStatus("OK");
}

export async function GET() {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return respondWithStatus("UNAUTHORIZED");
        }

        const profile = await getUserProfile(userId);
        if (!profile) {
            // getCurrentUserId가 유저를 조회한 시점에서 도달할 수 없는 구문
            return respondWithStatus("UNAUTHORIZED");
        }

        return respondWithStatus("OK", profile);
    } catch (err) {
        if (err instanceof ApiError) {
            return respondWithStatus(err.key, null, err.message);
        }

        console.error("[/api/users GET] unexpected error:", err);
        return respondWithStatus("INTERNAL_ERROR");
    }
}