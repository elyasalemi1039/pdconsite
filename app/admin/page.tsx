import Link from "next/link";

import AdminLoginForm, { LogoutButton } from "./login-form";

import { Button } from "@/components/ui/button";
import { getSessionFromCookies } from "@/lib/auth";

export default async function AdminPage() {
  const session = await getSessionFromCookies();

  if (!session) {
    return (
      <main className="min-h-screen bg-slate-50 py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <AdminLoginForm />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 py-16 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Signed in as</p>
            <h1 className="text-2xl font-semibold text-slate-900">
              {session.username}
            </h1>
          </div>
          <LogoutButton />
        </div>

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Admin Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-4">
            <Link href="/admin/create-product" className="w-full">
              <Button variant="outline" className="w-full">Create Product</Button>
            </Link>
            <Link href="/admin/product-selection" className="w-full">
              <Button variant="outline" className="w-full">
                Create Product Selection
              </Button>
            </Link>
            <Link href="/admin/view-products" className="w-full">
              <Button variant="outline" className="w-full">
                View Products
              </Button>
            </Link>
            <Link href="/admin/areas" className="w-full">
              <Button variant="outline" className="w-full">
                Manage Areas
              </Button>
            </Link>
            <Link href="/admin/bwa" className="w-full">
              <Button variant="outline" className="w-full">
                BWA Import
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

