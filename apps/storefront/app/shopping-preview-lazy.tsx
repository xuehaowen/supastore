"use client";

import dynamic from "next/dynamic";
// Keep destination evaluation out of the initial cart bundle for stores that
// do not configure contextual commerce rules.
export const ShoppingPreview = dynamic(() =>
  import("./shopping-preview").then((module) => module.ShoppingPreview),
);
