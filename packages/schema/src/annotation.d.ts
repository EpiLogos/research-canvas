import { z } from "zod";
export declare const pointSchema: z.ZodObject<{
    x: z.ZodNumber;
    y: z.ZodNumber;
    pressure: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const annotationStyleSchema: z.ZodObject<{
    color: z.ZodString;
    width: z.ZodNumber;
    opacity: z.ZodNumber;
}, z.core.$strip>;
export declare const annotationSchema: z.ZodObject<{
    id: z.ZodString;
    canvasId: z.ZodString;
    annotationType: z.ZodEnum<{
        stroke: "stroke";
        highlight: "highlight";
        arrow: "arrow";
        callout: "callout";
    }>;
    points: z.ZodArray<z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
        pressure: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    style: z.ZodObject<{
        color: z.ZodString;
        width: z.ZodNumber;
        opacity: z.ZodNumber;
    }, z.core.$strip>;
    text: z.ZodOptional<z.ZodString>;
    bounds: z.ZodObject<{
        position: z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
        }, z.core.$strip>;
        size: z.ZodObject<{
            width: z.ZodNumber;
            height: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export type AnnotationPoint = z.infer<typeof pointSchema>;
export type AnnotationStyle = z.infer<typeof annotationStyleSchema>;
export type Annotation = z.infer<typeof annotationSchema>;
