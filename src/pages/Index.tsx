import { useSeoMeta } from '@unhead/react';

// FIXME: Update this page (the content is just a fallback if you fail to update the page)

const Index = () => {
  useSeoMeta({
    title: 'Welcome to Your Blank App',
    description: 'A modern Nostr client application built with React, TailwindCSS, and Nostrify.',
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-gray-100">
          Welcome to Your Blank App
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400">
          Start building your amazing project here!
        </p>
      </div>
    </div>
  );
};

export default Index;
