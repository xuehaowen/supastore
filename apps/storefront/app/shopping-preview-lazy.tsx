"use client";

import dynamic from "next/dynamic";
// Load destination and delivery estimates separately from the main bag controls.
export const ShoppingPreview = dynamic(() =>
  import("./shopping-preview").then((module) => module.ShoppingPreview),
);
