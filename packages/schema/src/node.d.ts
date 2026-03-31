import { z } from "zod";
export declare const positionSchema: z.ZodObject<{
    x: z.ZodNumber;
    y: z.ZodNumber;
}, z.core.$strip>;
export declare const sizeSchema: z.ZodObject<{
    width: z.ZodNumber;
    height: z.ZodNumber;
}, z.core.$strip>;
export declare const resourceNodeSchema: z.ZodObject<{
    id: z.ZodString;
    canvasId: z.ZodString;
    title: z.ZodString;
    position: z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
    }, z.core.$strip>;
    size: z.ZodObject<{
        width: z.ZodNumber;
        height: z.ZodNumber;
    }, z.core.$strip>;
    summary: z.ZodDefault<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    type: z.ZodLiteral<"resource">;
    resourceKind: z.ZodEnum<{
        markdown: "markdown";
        text: "text";
        pdf: "pdf";
        image: "image";
        audio: "audio";
        video: "video";
        directory: "directory";
        url: "url";
        binary: "binary";
    }>;
    absolutePath: z.ZodString;
    relativePath: z.ZodString;
    mimeType: z.ZodString;
    fileFingerprint: z.ZodString;
    url: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const noteNodeSchema: z.ZodObject<{
    id: z.ZodString;
    canvasId: z.ZodString;
    title: z.ZodString;
    position: z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
    }, z.core.$strip>;
    size: z.ZodObject<{
        width: z.ZodNumber;
        height: z.ZodNumber;
    }, z.core.$strip>;
    summary: z.ZodDefault<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    type: z.ZodLiteral<"note">;
    content: z.ZodString;
    tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const groupNodeSchema: z.ZodObject<{
    id: z.ZodString;
    canvasId: z.ZodString;
    title: z.ZodString;
    position: z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
    }, z.core.$strip>;
    size: z.ZodObject<{
        width: z.ZodNumber;
        height: z.ZodNumber;
    }, z.core.$strip>;
    summary: z.ZodDefault<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    type: z.ZodLiteral<"group">;
    color: z.ZodString;
    childNodeIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const portalNodeSchema: z.ZodObject<{
    id: z.ZodString;
    canvasId: z.ZodString;
    title: z.ZodString;
    position: z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
    }, z.core.$strip>;
    size: z.ZodObject<{
        width: z.ZodNumber;
        height: z.ZodNumber;
    }, z.core.$strip>;
    summary: z.ZodDefault<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    type: z.ZodLiteral<"portal">;
    targetCanvasId: z.ZodString;
}, z.core.$strip>;
export declare const nodeSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    id: z.ZodString;
    canvasId: z.ZodString;
    title: z.ZodString;
    position: z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
    }, z.core.$strip>;
    size: z.ZodObject<{
        width: z.ZodNumber;
        height: z.ZodNumber;
    }, z.core.$strip>;
    summary: z.ZodDefault<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    type: z.ZodLiteral<"resource">;
    resourceKind: z.ZodEnum<{
        markdown: "markdown";
        text: "text";
        pdf: "pdf";
        image: "image";
        audio: "audio";
        video: "video";
        directory: "directory";
        url: "url";
        binary: "binary";
    }>;
    absolutePath: z.ZodString;
    relativePath: z.ZodString;
    mimeType: z.ZodString;
    fileFingerprint: z.ZodString;
    url: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    canvasId: z.ZodString;
    title: z.ZodString;
    position: z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
    }, z.core.$strip>;
    size: z.ZodObject<{
        width: z.ZodNumber;
        height: z.ZodNumber;
    }, z.core.$strip>;
    summary: z.ZodDefault<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    type: z.ZodLiteral<"note">;
    content: z.ZodString;
    tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    canvasId: z.ZodString;
    title: z.ZodString;
    position: z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
    }, z.core.$strip>;
    size: z.ZodObject<{
        width: z.ZodNumber;
        height: z.ZodNumber;
    }, z.core.$strip>;
    summary: z.ZodDefault<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    type: z.ZodLiteral<"group">;
    color: z.ZodString;
    childNodeIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    canvasId: z.ZodString;
    title: z.ZodString;
    position: z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
    }, z.core.$strip>;
    size: z.ZodObject<{
        width: z.ZodNumber;
        height: z.ZodNumber;
    }, z.core.$strip>;
    summary: z.ZodDefault<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    type: z.ZodLiteral<"portal">;
    targetCanvasId: z.ZodString;
}, z.core.$strip>], "type">;
export type Position = z.infer<typeof positionSchema>;
export type Size = z.infer<typeof sizeSchema>;
export type ResourceNode = z.infer<typeof resourceNodeSchema>;
export type NoteNode = z.infer<typeof noteNodeSchema>;
export type GroupNode = z.infer<typeof groupNodeSchema>;
export type PortalNode = z.infer<typeof portalNodeSchema>;
export type CanvasNode = z.infer<typeof nodeSchema>;
