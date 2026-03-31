interface ImageViewerProps {
  source: string;
  title: string;
  alt?: string;
  className?: string;
}

export function ImageViewer({ source, title, alt, className }: ImageViewerProps) {
  return (
    <figure className={["image-viewer", className].filter(Boolean).join(" ")}>
      <img alt={alt ?? title} className="image-viewer__image" src={source} />
      <figcaption className="image-viewer__caption">{title}</figcaption>
    </figure>
  );
}
