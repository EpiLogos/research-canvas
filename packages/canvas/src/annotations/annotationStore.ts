import { createStore } from "zustand/vanilla";

import {
  annotationSchema,
  type Annotation,
  type AnnotationPoint
} from "@research-canvas/schema";

import { boundsFromPoints, styleForAnnotation } from "./annotationTools";

export interface AnnotationStoreState {
  annotations: Annotation[];
  createStrokeAnnotation: (input: {
    points: AnnotationPoint[];
    strokeKind: "highlight" | "stroke";
  }) => Annotation;
  hydrate: (snapshot: Annotation[]) => void;
  serialize: () => Annotation[];
}

interface CreateAnnotationStoreOptions {
  canvasId: string;
}

export function createAnnotationStore({
  canvasId
}: CreateAnnotationStoreOptions) {
  return createStore<AnnotationStoreState>((set, get) => ({
    annotations: [],
    createStrokeAnnotation: ({ points, strokeKind }) => {
      const annotation = annotationSchema.parse({
        id: crypto.randomUUID(),
        canvasId,
        annotationType: strokeKind,
        points,
        style: styleForAnnotation(strokeKind),
        bounds: boundsFromPoints(points),
        createdAt: now(),
        updatedAt: now()
      });

      set((state) => ({
        annotations: [...state.annotations, annotation]
      }));

      return annotation;
    },
    hydrate: (snapshot) => {
      set({
        annotations: snapshot.map((annotation) => annotationSchema.parse(annotation))
      });
    },
    serialize: () => get().annotations
  }));
}

function now() {
  return new Date().toISOString();
}
