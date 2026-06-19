import Link from "next/link";
import { Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="content">
      <section className="legal-panel">
        <h1>Page not found</h1>
        <p>The page may have expired, moved, or been removed.</p>
        <Link className="button" href="/">
          <Search size={17} aria-hidden="true" />
          Search
        </Link>
      </section>
    </div>
  );
}

