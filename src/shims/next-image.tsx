import type { CSSProperties, ImgHTMLAttributes } from "react";

// Minimal stand-in for `next/image`. Renders a plain <img>.
// Supports the props NorthBike components use: src, alt, fill, width,
// height, sizes, priority, className, style. Non-DOM props are dropped.
type NextImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height"> & {
  src: string | { src: string };
  alt?: string;
  fill?: boolean;
  width?: number | string;
  height?: number | string;
  sizes?: string;
  priority?: boolean;
  quality?: number;
  unoptimized?: boolean;
};

export default function Image({
  src,
  alt = "",
  fill,
  width,
  height,
  sizes: _sizes,
  priority: _priority,
  quality: _quality,
  unoptimized: _unoptimized,
  className,
  style,
  ...rest
}: NextImageProps) {
  const resolvedSrc = typeof src === "string" ? src : src.src;

  const fillStyle: CSSProperties | undefined = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style }
    : style;

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      width={fill ? undefined : (width as number | undefined)}
      height={fill ? undefined : (height as number | undefined)}
      className={className}
      style={fillStyle}
      loading={_priority ? "eager" : "lazy"}
      {...rest}
    />
  );
}
