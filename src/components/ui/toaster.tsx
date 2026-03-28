import { useEffect, useState } from "react"

import { useToast } from "@/hooks/useToast"
import tailwindConfig from "../../../tailwind.config"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

const MD_BREAKPOINT = parseFloat(tailwindConfig.theme.screens.md);

export function Toaster() {
  const { toasts } = useToast()
  const [isMdScreen, setIsMdScreen] = useState(window.innerWidth >= MD_BREAKPOINT)

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${MD_BREAKPOINT}px)`)
    const onChange = () => setIsMdScreen(mql.matches)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return (
    <ToastProvider swipeDirection={isMdScreen ? "right" : "up"}>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
