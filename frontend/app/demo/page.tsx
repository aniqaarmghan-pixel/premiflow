import type { Metadata } from "next";

import { ProductDemo } from "@/components/demo/ProductDemo";

export const metadata: Metadata = {
  title: "Product demo \u00b7 Premiflow",
  description: "A narrated walkthrough of the PREMIFLOW marketplace and protected payment flow, using sample data.",
};

export default function Page() {
  return <ProductDemo />;
}
