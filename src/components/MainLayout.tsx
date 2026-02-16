import { LeftSidebar } from '@/components/LeftSidebar';
import { RightSidebar } from '@/components/RightSidebar';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex justify-center min-h-screen">
      <LeftSidebar />
      {children}
      <RightSidebar />
    </div>
  );
}
