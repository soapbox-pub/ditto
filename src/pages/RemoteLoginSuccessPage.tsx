import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Capacitor } from "@capacitor/core";

/**
 * Shown when a remote signer (e.g. Amber / Primal) redirects back after
 * approving a NIP-46 nostrconnect request.
 *
 * - Native app: the deep link re-opens Ditto; we redirect home automatically
 *   after a short delay so the NIP-46 subscription has time to receive and
 *   persist the auth event.
 * - Web browser: the signer opened this URL in the browser.  The NIP-46
 *   subscription in the original tab will complete in the background, so we
 *   just tell the user they can close this tab.
 */
export function RemoteLoginSuccessPage() {
  const navigate = useNavigate();
  const isNative = Capacitor.isNativePlatform();

  // On native, navigate home automatically after a brief delay.
  useEffect(() => {
    if (!isNative) return;
    const timer = setTimeout(() => navigate("/", { replace: true }), 1500);
    return () => clearTimeout(timer);
  }, [isNative, navigate]);

  return (
    <main className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center px-8 space-y-4 max-w-sm">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
        <h1 className="text-2xl font-bold">Login approved!</h1>
        {isNative ? (
          <p className="text-muted-foreground">Taking you back to the app&hellip;</p>
        ) : (
          <>
            <p className="text-muted-foreground">
              Your signer approved the connection. You can close this tab and return to the app.
            </p>
            <Button onClick={() => navigate("/", { replace: true })}>
              Go home
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
