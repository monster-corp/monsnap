export const ALLOWED_IMAGE_TYPES = [
    "image/png",
    "image/jpeg", // jpg와 jpeg의 mime type은 동일함
    "image/webp",
] as const;

export function isAllowedImageType(
    type: string,
): type is (typeof ALLOWED_IMAGE_TYPES)[number] {
    return ALLOWED_IMAGE_TYPES.includes(
        type as (typeof ALLOWED_IMAGE_TYPES)[number]
    );
}