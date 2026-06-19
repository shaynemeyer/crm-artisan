import { SidebarNav, BottomNav } from "@/components/app-nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar — icon-only on md, icon+label on lg */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:w-14 lg:w-56 border-r bg-background z-30">
        <div className="flex h-14 items-center border-b px-3 lg:px-4">
          <span className="hidden lg:block text-sm font-semibold tracking-tight">
            CRM Artisan
          </span>
          <span className="lg:hidden text-sm font-bold">CA</span>
        </div>
        <SidebarNav />
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col md:pl-14 lg:pl-56">
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">{children}</main>
      </div>

      {/* Bottom tab bar — mobile only */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden border-t bg-background z-30">
        <BottomNav />
      </div>
    </div>
  );
}
