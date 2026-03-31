import { z } from "zod";
export declare const viewportSchema: z.ZodObject<{
    x: z.ZodNumber;
    y: z.ZodNumber;
    zoom: z.ZodNumber;
}, z.core.$strip>;
export declare const canvasSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    name: z.ZodString;
    kind: z.ZodDefault<z.ZodEnum<{
        primary: "primary";
        subcanvas: "subcanvas";
    }>>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    lastViewport: z.ZodOptional<z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
        zoom: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type Viewport = z.infer<typeof viewportSchema>;
export type Canvas = z.infer<typeof canvasSchema>;
