import { z } from "zod";
export declare const publishSettingsSchema: z.ZodObject<{
    includeResources: z.ZodBoolean;
    mobileSequenceFirst: z.ZodBoolean;
    theme: z.ZodDefault<z.ZodEnum<{
        paper: "paper";
        nocturne: "nocturne";
        ledger: "ledger";
    }>>;
}, z.core.$strip>;
export declare const projectSchema: z.ZodObject<{
    id: z.ZodString;
    displayName: z.ZodString;
    slug: z.ZodString;
    parentConstellationId: z.ZodNullable<z.ZodString>;
    rootPath: z.ZodString;
    primaryCanvasId: z.ZodString;
    summary: z.ZodDefault<z.ZodString>;
    coverAssetPath: z.ZodNullable<z.ZodString>;
    publishSettings: z.ZodObject<{
        includeResources: z.ZodBoolean;
        mobileSequenceFirst: z.ZodBoolean;
        theme: z.ZodDefault<z.ZodEnum<{
            paper: "paper";
            nocturne: "nocturne";
            ledger: "ledger";
        }>>;
    }, z.core.$strip>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export type PublishSettings = z.infer<typeof publishSettingsSchema>;
export type Project = z.infer<typeof projectSchema>;
