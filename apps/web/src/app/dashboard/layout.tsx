import { Navbar } from '@/components/shared/Navbar';
import { Footer } from '@/components/shared/Footer';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="min-h-[80vh] py-12 px-6">
        <div className="max-w-3xl mx-auto">{children}</div>
      </main>
      <Footer />
    </>
  );
}
