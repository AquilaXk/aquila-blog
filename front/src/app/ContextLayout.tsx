"use client";

import { AuthProvider } from "@/global/auth/hooks/useAuth";

import ClientLayout from "./ClientLayout";

export default function ContextLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthProvider>
      <ClientLayout>{children}</ClientLayout>
    </AuthProvider>
  );
}
