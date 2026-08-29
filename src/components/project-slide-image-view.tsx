"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  getSvgImageRenderPlan,
  type ProjectSlideImageEdit,
} from "@/lib/project-slide-image-edit";

export function ProjectSlideImageView({
  src,
  alt,
  sourceWidth,
  sourceHeight,
  imageEdit,
  className,
  style,
  draggable = false,
}: {
  src: string;
  alt: string;
  sourceWidth?: number;
  sourceHeight?: number;
  imageEdit?: ProjectSlideImageEdit;
  className?: string;
  style?: CSSProperties;
  draggable?: boolean;
}) {
  if (
    typeof sourceWidth === "number" &&
    sourceWidth > 0 &&
    typeof sourceHeight === "number" &&
    sourceHeight > 0
  ) {
    return (
      <MeasuredProjectSlideImageView
        src={src}
        alt={alt}
        sourceWidth={sourceWidth}
        sourceHeight={sourceHeight}
        imageEdit={imageEdit}
        className={className}
        style={style}
        draggable={draggable}
      />
    );
  }

  return (
    <NaturalSizeProjectSlideImageView
      key={src}
      src={src}
      alt={alt}
      imageEdit={imageEdit}
      className={className}
      style={style}
      draggable={draggable}
    />
  );
}

type ImageViewProps = {
  src: string;
  alt: string;
  imageEdit?: ProjectSlideImageEdit;
  className?: string;
  style?: CSSProperties;
  draggable: boolean;
};

function NaturalSizeProjectSlideImageView(props: ImageViewProps) {
  const [measured, setMeasured] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      setMeasured({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.src = props.src;

    return () => {
      image.onload = null;
    };
  }, [props.src]);

  if (!measured || measured.width <= 0 || measured.height <= 0) {
    return (
      <div
        className={props.className}
        style={props.style}
        aria-hidden={props.alt === "" ? true : undefined}
      />
    );
  }

  return (
    <MeasuredProjectSlideImageView
      {...props}
      sourceWidth={measured.width}
      sourceHeight={measured.height}
    />
  );
}

function MeasuredProjectSlideImageView({
  src,
  alt,
  sourceWidth,
  sourceHeight,
  imageEdit,
  className,
  style,
  draggable,
}: ImageViewProps & { sourceWidth: number; sourceHeight: number }) {
  const plan = getSvgImageRenderPlan({
    sourceWidth,
    sourceHeight,
    imageEdit,
  });

  return (
    <svg
      className={className}
      style={style}
      width="100%"
      height="100%"
      viewBox={plan.viewBox}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={alt || undefined}
      aria-hidden={alt === "" ? true : undefined}
      onDragStart={
        draggable ? undefined : (event) => event.preventDefault()
      }
    >
      <image
        href={src}
        width={plan.imageWidth}
        height={plan.imageHeight}
        transform={plan.transform || undefined}
        preserveAspectRatio="none"
      />
    </svg>
  );
}
