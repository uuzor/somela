import React, { useState } from "react";
import Navbar from "@/components/dashboard/Navbar";
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
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 overflow-y-auto py-4 pl-5">
          <FilterSidebar filters={filters} setFilters={setFilters} />
          <ProductGrid filters={filters} setFilters={setFilters} />
        </div>
        <AIAssistant />
      </div>
    </div>
  );
}