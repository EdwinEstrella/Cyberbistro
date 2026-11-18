import { useState } from "react";
import { UtensilsCrossed } from "lucide-react";

export interface DishImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
  onError?: (event: React.SyntheticEvent<HTMLImageElement, Event>) => void;
  initialError?: boolean;
  /** Optional handler to expose the underlying image props (for testing error events) */
  onRenderImgProps?: (props: React.ImgHTMLAttributes<HTMLImageElement>) => void;
}

export function DishImage({
  src,
  alt = "",
  className = "mb-4 h-36 w-full rounded-[20px] object-cover bg-[#1a1a1a]",
  fallbackClassName = "mb-4 flex h-36 w-full items-center justify-center rounded-[20px] border border-[#262626] bg-[#1a1a1a] text-[#adaaaa] shadow-inner",
  onError,
  initialError = false,
  onRenderImgProps,
}: DishImageProps) {
  const [hasError, setHasError] = useState(initialError);

  if (!src) return null;

  if (hasError) {
    return (
      <div
        data-testid="dish-image-fallback"
        role="img"
        aria-label={alt ? `Imagen no disponible para ${alt}` : "Imagen no disponible"}
        className={fallbackClassName}
      >
        <UtensilsCrossed className="size-8 opacity-60" aria-hidden="true" />
      </div>
    );
  }

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setHasError(true);
    onError?.(e);
  };

  const imgProps: React.ImgHTMLAttributes<HTMLImageElement> = {
    src,
    alt,
    className,
    onError: handleImageError,
  };

  onRenderImgProps?.(imgProps);

  return <img {...imgProps} />;
}
