import {openai} from "@ai-sdk/openai";
import {generateText, NoOutputGeneratedError, Output} from "ai";
import {type VlmResponse, vlmResponseSchema} from "@/lib/schemas/vlm";
import {VlmCallError, VlmResponseInvalidError, VlmTimeoutError} from "@/lib/errors/vlm";

const VLM_TIMEOUT_MS = 15_000;

const VLM_PROMPT = `
너는 사물 이미지를 분석하는 분석기다. 사진 속 사물의 재질(material)과 형태(shape)를 판단해라.

material은 다음 중 하나여야 한다: NORMAL, FIRE, WATER, GRASS, METAL, CERAMIC, GLASS, PLASTIC, ELECTRIC
shape는 다음 중 하나여야 한다: FREEFORM, ROUND, TRIANGLE, SQUARE, LONG

재질이 여러 개 섞여 있으면 가장 넓은 면적을 차지하는 재질 하나를 선택해라.
confidence는 0~100 사이의 정수부와 소수점 이하 2자리로 표현하여 판단에 대한 확신도를 나타낸다.
사진에 사람의 얼굴이나 신체가 주된 피사체로 나오면 block_reason을 "FACE"로 설정해라.
사진이 모니터, TV, 스마트폰 화면 등 다른 화면을 촬영한 것이거나, 인쇄된 사진을 재촬영한 것으로 보이면 block_reason을 "SCREEN"으로 설정해라.
둘 다 해당하면 얼굴을 우선해 "FACE"로 설정해라.
둘 다 해당하지 않으면 block_reason을 "NONE"으로 설정해라.
`;

export async function callVlm(image: File): Promise<VlmResponse> {
    const base64 = await fileToBase64(image);

    let output: unknown;
    try {
        const result = await withTimeout(
            generateText({
                model: openai("gpt-5-mini"),
                output: Output.object({schema: vlmResponseSchema}),
                messages: [
                    {
                        role: "user",
                        content: [
                            {type: "text", text: VLM_PROMPT},
                            {type: "image", image: base64},
                        ],
                    },
                ],
            }),
            VLM_TIMEOUT_MS
        );
        output = result.output;
    } catch (err) {
        if (err instanceof TimeoutError) {
            throw new VlmTimeoutError();
        }
        if (NoOutputGeneratedError.isInstance(err)) {
            throw new VlmResponseInvalidError(err);
        }
        throw new VlmCallError(err);
    }

    // AI SDK의 구조화 출력 이후에도 방어적으로 Zod 검증을 한 번 더 수행
    const parsed = vlmResponseSchema.safeParse(output);
    if (!parsed.success) {
        throw new VlmResponseInvalidError(parsed.error);
    }

    return parsed.data;
}

async function fileToBase64(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    return Buffer.from(buffer).toString("base64");
}

class TimeoutError extends Error {
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new TimeoutError()), ms)
        ),
    ]);
}