import { z } from "zod";
export declare const edgeStyleSchema: z.ZodObject<{
    stroke: z.ZodString;
    width: z.ZodNumber;
    dashed: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export declare const edgeSchema: z.ZodObject<{
    id: z.ZodString;
    canvasId: z.ZodString;
    sourceNodeId: z.ZodString;
    targetNodeId: z.ZodString;
    relationKind: z.ZodString;
    directionality: z.ZodEnum<{
        none: "none";
        forward: "forward";
        backward: "backward";
        bidirectional: "bidirectional";
    }>;
    label: z.ZodDefault<z.ZodString>;
    note: z.ZodDefault<z.ZodString>;
    style: z.ZodObject<{
        stroke: z.ZodString;
        width: z.ZodNumber;
        dashed: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export type EdgeStyle = z.infer<typeof edgeStyleSchema>;
export type CanvasEdge = z.infer<typeof edgeSchema>;
