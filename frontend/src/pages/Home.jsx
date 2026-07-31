import React, { useState } from "react";
import AppShell from "@/components/layout/AppShell";
import FilterSidebar from "@/components/dashboard/FilterSidebar";
import ProductGrid from "@/components/dashboard/ProductGrid";
import AIAssistant from "@/components/dashboard/AIAssistant";

export default function Home() {
  const [filters, setFilters] = useState({
    categories: [],
    size: "M",
    availability: "All",
    price: "$50 - $100",
  });

  return (
    <AppShell>
      <div className="flex h-full min-h-0 overflow-hidden bg-white">
        <div className="flex flex-1 overflow-y-auto py-4 pl-5">
          <FilterSidebar filters={filters} setFilters={setFilters} />
          <ProductGrid filters={filters} setFilters={setFilters} />
        </div>
        <AIAssistant />
      </div>
    </AppShell>
  );
}