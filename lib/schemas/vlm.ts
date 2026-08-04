import {z} from "zod";
import {ErrorKey} from "@/lib/api/response";

export const MATERIAL_VALUES = [
    "NORMAL", "FIRE", "WATER", "GRASS", "METAL", "CERAMIC", "GLASS", "PLASTIC", "ELECTRIC",
] as const;

export const SHAPE_VALUES = [
    "FREEFORM", "ROUND", "TRIANGLE", "SQUARE", "LONG",
] as const;

export const BLOCK_REASON_VALUES = [
    "NONE", "FACE", "SCREEN"
] as const;

export const vlmResponseSchema = z.object({
    material: z.enum(MATERIAL_VALUES),
    shape: z.enum(SHAPE_VALUES),
    confidence: z.number().min(0).max(100),
    block_reason: z.enum(BLOCK_REASON_VALUES),
});

export type VlmResponse = z.infer<typeof vlmResponseSchema>;

export const BLOCK_REASON_TO_ERROR: Partial<Record<VlmResponse["block_reason"], ErrorKey>> = {
    FACE: "FACE_BLOCKED",
    SCREEN: "SCREEN_BLOCKED",
};