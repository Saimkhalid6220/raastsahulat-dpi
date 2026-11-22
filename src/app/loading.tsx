import { LoadingSkeleton } from "@/components/loading";

export default function Loading() {
  return <>
    <header className="topbar"><span className="brand">RaastSahulat</span></header>
    <main className="workspace-content workspace-loading" id="main">
      <section className="panel"><LoadingSkeleton label="Loading your workspace…" /></section>
    </main>
  </>;
}
