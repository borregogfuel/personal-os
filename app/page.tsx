"use client";
import dynamic from "next/dynamic";

const OSApp = dynamic(() => import("./OSApp"), { ssr: false });

export default function Page() {
  return <OSApp />;
}
