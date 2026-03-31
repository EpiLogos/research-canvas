import { z } from "zod";
export declare const sequenceSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    canvasId: z.ZodString;
    name: z.ZodString;
    kind: z.ZodEnum<{
        storyboard: "storyboard";
        historical: "historical";
        logical: "logical";
        research: "research";
        presentation: "presentation";
    }>;
    description: z.ZodDefault<z.ZodString>;
    published: z.ZodBoolean;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export declare const sequenceStepSchema: z.ZodObject<{
    id: z.ZodString;
    sequenceId: z.ZodString;
    position: z.ZodNumber;
    targetType: z.ZodEnum<{
        node: "node";
        edge: "edge";
    }>;
    targetId: z.ZodString;
    caption: z.ZodDefault<z.ZodString>;
    viewport: z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
        zoom: z.ZodNumber;
    }, z.core.$strip>;
    transitionHint: z.ZodDefault<z.ZodEnum<{
        cut: "cut";
        ease: "ease";
        spotlight: "spotlight";
    }>>;
}, z.core.$strip>;
export type Sequence = z.infer<typeof sequenceSchema>;
export type SequenceStep = z.infer<typeof sequenceStepSchema>;
