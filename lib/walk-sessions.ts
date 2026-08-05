import {prisma} from "@/lib/prisma";
import {Prisma} from "@/app/generated/prisma/client";
import type {Egg, EggWalkSession} from "@/app/generated/prisma/client";
import {
    EggNotFoundError,
    EggNotWalkableError,
    SessionAlreadyActiveError,
    SessionNotActiveError,
    StepCountRegressedError,
    WalkSessionNotFoundError,
} from "@/lib/errors/walk-session";
import {EggStatus, WalkSessionStatus, WalkSessionEndReasonType,} from "@/lib/status";

export async function createWalkSession(
    userId: bigint,
    eggId: bigint
): Promise<EggWalkSession> {
    return prisma.$transaction(async (tx) => {
        const egg = await tx.egg.findFirst({
            where: {id: eggId, userId},
            select: {id: true, status: true},
        });
        if (!egg) {
            throw new EggNotFoundError();
        }
        if (egg.status !== EggStatus.INCUBATING) {
            throw new EggNotWalkableError();
        }

        const active = await tx.eggWalkSession.findFirst({
            where: {
                userId,
                status: WalkSessionStatus.ACTIVE,
            },
            select: {
                id: true,
            },
        });

        if (active) {
            throw new SessionAlreadyActiveError();
        }

        try {
            return tx.eggWalkSession.create({
                data: {
                    eggId,
                    userId,
                },
            });
        } catch (err) {
            if (
                err instanceof Prisma.PrismaClientKnownRequestError
                && err.code === "P2002"
                && err.meta?.target === "egg_walk_sessions_one_active_per_user"
            ) {
                throw new SessionAlreadyActiveError();
            }

            throw err;
        }
    });
}

export type ApplyStepsResult = {
    session: EggWalkSession;
    egg: Egg;
    stepsDelta: number;
};

export async function applyStepsToWalkSession(
    userId: bigint,
    eggId: bigint,
    sessionId: bigint,
    clientStepsCaptured: number
): Promise<ApplyStepsResult> {
    return prisma.$transaction(
        async (tx) => {
            const session = await tx.eggWalkSession.findFirst({
                where: {id: sessionId, eggId, userId},
                include: {egg: true},
            });
            if (!session) {
                throw new WalkSessionNotFoundError();
            }
            if (session.status !== WalkSessionStatus.ACTIVE) {
                throw new SessionNotActiveError();
            }

            if (clientStepsCaptured < session.stepsCaptured) {
                throw new StepCountRegressedError();
            }

            const diff = clientStepsCaptured - session.stepsCaptured;
            if (diff === 0) {
                return {session, egg: session.egg, stepsDelta: 0};
            }

            const updatedSession = await tx.eggWalkSession.update({
                where: {id: sessionId},
                data: {stepsCaptured: clientStepsCaptured},
            });

            const newCurrentSteps = Math.min(
                session.egg.currentSteps + diff,
                session.egg.requiredSteps
            );
            const shouldReady =
                session.egg.status === EggStatus.INCUBATING &&
                newCurrentSteps >= session.egg.requiredSteps;

            const updatedEgg = await tx.egg.update({
                where: {id: eggId},
                data: {
                    currentSteps: newCurrentSteps,
                    ...(shouldReady
                        ? {status: EggStatus.READY, readyAt: new Date()}
                        : {}),
                },
            });

            return {session: updatedSession, egg: updatedEgg, stepsDelta: diff};
        },
        {isolationLevel: Prisma.TransactionIsolationLevel.Serializable}
    );
}

export async function endWalkSession(
    userId: bigint,
    eggId: bigint,
    sessionId: bigint,
    endReason: WalkSessionEndReasonType
): Promise<EggWalkSession> {
    return prisma.$transaction(async (tx) => {
        const session = await tx.eggWalkSession.findFirst({
            where: {id: sessionId, eggId, userId},
            select: {id: true, status: true},
        });
        if (!session) {
            throw new WalkSessionNotFoundError();
        }
        if (session.status !== WalkSessionStatus.ACTIVE) {
            throw new SessionNotActiveError();
        }

        return tx.eggWalkSession.update({
            where: {id: sessionId},
            data: {
                status: WalkSessionStatus.ENDED,
                endedAt: new Date(),
                endReason,
            },
        });
    });
}