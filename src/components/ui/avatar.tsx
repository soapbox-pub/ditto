import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Shared ref so AvatarFallback can check if a sibling AvatarImage
 * has a src without needing state or effects. Mutating a ref during
 * render is safe — it doesn't trigger re-renders.
 */
const AvatarHasSrcContext = React.createContext<React.MutableRefObject<boolean>>({ current: false })

const Avatar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const hasSrcRef = React.useRef(false)
  // Reset per render so stale values don't persist
  hasSrcRef.current = false

  return (
    <AvatarHasSrcContext.Provider value={hasSrcRef}>
      <div
        ref={ref}
        className={cn(
          "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </AvatarHasSrcContext.Provider>
  )
})
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

  // AvatarImage renders before AvatarFallback (DOM order), so hasSrcRef
  // is already set by the time we read it here in the same render frame.
  if (hasSrcRef.current) return null

  return (
    <div
      ref={ref}
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full",
        className
      )}
      {...props}
    />
  )
})
AvatarFallback.displayName = "AvatarFallback"

export { Avatar, AvatarImage, AvatarFallback }
