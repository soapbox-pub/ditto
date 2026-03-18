import * as React from "react"

import { cn } from "@/lib/utils"
import { type AvatarShape, isEmoji, getAvatarMaskUrlAsync, isValidAvatarShape } from "@/lib/avatarShape"
import { isBlobbiShape } from "@/lib/blobbiShapes"

/**
 * Shared ref so AvatarFallback can check if a sibling AvatarImage
 * has a src without needing state or effects. Mutating a ref during
 * render is safe — it doesn't trigger re-renders.
 */
const AvatarHasSrcContext = React.createContext<React.MutableRefObject<boolean>>({ current: false })

/** Context so children can inherit the shape for their own styling. */
const AvatarShapeContext = React.createContext<AvatarShape | undefined>(undefined)

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Avatar mask shape. Defaults to "circle" (the standard rounded-full). */
  shape?: AvatarShape;
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, children, shape, style, ...props }, ref) => {
    const hasSrcRef = React.useRef(false)
    // Reset per render so stale values don't persist
    hasSrcRef.current = false

    // Check if shape is valid (emoji or Blobbi)
    const hasValidShape = !!shape && isValidAvatarShape(shape)
    const isEmojiShape = hasValidShape && isEmoji(shape)
    const isBlobbi = hasValidShape && isBlobbiShape(shape)
    const hasCustomShape = isEmojiShape || isBlobbi

    // State for the async-loaded mask URL
    const [maskUrl, setMaskUrl] = React.useState<string>('')

    // Load mask URL asynchronously when shape changes
    React.useEffect(() => {
      if (!hasCustomShape || !shape) {
        setMaskUrl('')
        return
      }

      let cancelled = false

      getAvatarMaskUrlAsync(shape).then((url) => {
        if (!cancelled) {
          setMaskUrl(url)
        }
      })

      return () => {
        cancelled = true
      }
    }, [hasCustomShape, shape])

    const mergedStyle = React.useMemo<React.CSSProperties>(() => {
      if (maskUrl) {
        return {
          ...style,
          WebkitMaskImage: `url(${maskUrl})`,
          maskImage: `url(${maskUrl})`,
          WebkitMaskSize: 'contain',
          maskSize: 'contain' as string,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat' as string,
          WebkitMaskPosition: 'center',
          maskPosition: 'center' as string,
        }
      }
      return style ?? {}
    }, [maskUrl, style])

    return (
      <AvatarHasSrcContext.Provider value={hasSrcRef}>
        <AvatarShapeContext.Provider value={shape}>
          <div
            ref={ref}
            className={cn(
              "relative flex h-10 w-10 shrink-0 overflow-hidden bg-muted",
              !hasCustomShape && "rounded-full",
              className
            )}
            style={mergedStyle}
            {...props}
          >
            {children}
          </div>
        </AvatarShapeContext.Provider>
      </AvatarHasSrcContext.Provider>
    )
  }
)
Avatar.displayName = "Avatar"

/**
 * Renders the <img> immediately with absolute positioning so it covers
 * the fallback. No hidden Image() verification — the browser renders
 * the image progressively as it downloads.
 */
const AvatarImage = React.forwardRef<
  HTMLImageElement,
  React.ImgHTMLAttributes<HTMLImageElement>
>(({ className, onError, ...props }, ref) => {
  const [hasError, setHasError] = React.useState(false)
  const hasSrcRef = React.useContext(AvatarHasSrcContext)
  const src = props.src

  // Reset error when src changes
  const prevSrc = React.useRef(src)
  if (src !== prevSrc.current) {
    prevSrc.current = src
    if (hasError) setHasError(false)
  }

  const showImage = !hasError && !!src

  // Signal to AvatarFallback synchronously during this render frame
  if (showImage) {
    hasSrcRef.current = true
  }

  if (!showImage) return null

  return (
    <img
      {...props}
      ref={ref}
      alt=""
      className={cn("absolute inset-0 h-full w-full object-cover", className)}
      onError={(e) => {
        setHasError(true)
        onError?.(e)
      }}
    />
  )
})
AvatarImage.displayName = "AvatarImage"

/**
 * Fallback content (letter initial). Hidden when AvatarImage has a src,
 * so there's no flash of the letter while the image downloads. The
 * Avatar's bg-muted background provides the placeholder color instead.
 */
const AvatarFallback = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const hasSrcRef = React.useContext(AvatarHasSrcContext)
  const shape = React.useContext(AvatarShapeContext)

  const hasCustomShape = !!shape && isValidAvatarShape(shape)

  // AvatarImage renders before AvatarFallback (DOM order), so hasSrcRef
  // is already set by the time we read it here in the same render frame.
  if (hasSrcRef.current) return null

  return (
    <div
      ref={ref}
      className={cn(
        "flex h-full w-full items-center justify-center",
        !hasCustomShape && "rounded-full",
        className
      )}
      {...props}
    />
  )
})
AvatarFallback.displayName = "AvatarFallback"

export { Avatar, AvatarImage, AvatarFallback }
