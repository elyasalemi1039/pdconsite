export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Admin pages don't show the main header/navbar
  return <>{children}</>;
}

