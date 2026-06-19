import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const columns = ["Name", "Company", "Phone", "Email"];

export default function ClientsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your clients and their contact details.</p>
        </div>
        <Button>
          <Plus className="size-4 mr-2" />
          Add Client
        </Button>
      </div>

      <div className="rounded-lg border">
        {/* Desktop table header */}
        <div className="hidden md:grid md:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 border-b bg-muted/40">
          {columns.map((col) => (
            <span key={col} className="text-sm font-medium text-muted-foreground">{col}</span>
          ))}
          <span />
        </div>

        {/* Empty state */}
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm font-medium">No clients yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Add your first client to get started.</p>
          <Button className="mt-4">
            <Plus className="size-4 mr-2" />
            Add Client
          </Button>
        </div>
      </div>
    </div>
  );
}
