import { listWorkflows } from "@/actions/workflow";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const workflows = await listWorkflows();

  return (
    <div className="flex h-screen bg-[#f8f9fc] font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-10">
          <div className="max-w-6xl mx-auto space-y-10">
            {/* Hero Section */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-12 text-white shadow-lg relative overflow-hidden">
              <div className="relative z-10 max-w-2xl">
                <h2 className="text-4xl font-bold mb-4">Unleash your creative logic</h2>
                <p className="text-blue-100 text-lg mb-8 leading-relaxed">
                  Orchestrate complex AI workflows across multiple models with Magica's intuitive canvas. Drag, connect, and automate your productivity.
                </p>
                <div className="flex gap-4">
                  <form action={async () => {
                    "use server";
                    const { createWorkflow } = await import("@/actions/workflow");
                    await createWorkflow("Untitled Workflow");
                  }}>
                    <button type="submit" className="bg-white text-blue-700 hover:bg-zinc-50 px-6 py-3 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2">
                       Create New Workflow
                    </button>
                  </form>
                  
                </div>
              </div>
              {/* Decorative background elements can go here */}
            </div>

            {/* Dashboard Client Area (Workflows + Stats) */}
            <DashboardClient initialWorkflows={workflows} />
          </div>
        </main>
      </div>
    </div>
  );
}
