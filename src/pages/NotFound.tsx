import { useSeoMeta } from "@unhead/react";
import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useSeoMeta({
    title: "404 - Page Not Found | Ditto",
    description: "The page you are looking for could not be found.",
  });

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen flex items-center justify-center">
      <div className="text-center px-8">
        <h1 className="text-6xl font-bold mb-4 text-primary">404</h1>
        <p className="text-xl text-muted-foreground mb-6">This page doesn't exist.</p>
        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-6 py-2.5 font-bold hover:bg-primary/90 transition-colors"
        >
          Go home
        </Link>
      </div>
    </main>
  );
};

export default NotFound;
