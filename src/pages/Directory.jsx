import { ArrowUpRight } from "lucide-react";
import React from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
export default function Directory() {
  const location = useLocation(),
    [params] = useSearchParams();
  const tutors = location.pathname.startsWith("/tutors");
  return (
    <div className="container page">
      <div className="eyebrow">FOLLOW YOUR CURIOSITY</div>
      <h1>
        {tutors ? "Find your kind of tutor." : "A little more understanding."}
      </h1>
      {params.get("q") && (
        <p>
          Subject: <strong>{params.get("q")}</strong>
        </p>
      )}
      <div className="panel">
        <h2>{tutors ? "Tutor directory" : "Learning resources"}</h2>
        <p role="status">
          This section is awaiting the shared {tutors ? "tutor" : "resource"}{" "}
          service. No live {tutors ? "profiles" : "resources"} are available in
          this preview.
        </p>
        <Link className="text-link" to="/">
          Back home{" "}
          <ArrowUpRight className="inline-arrow" size={16} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
export function Contact() {
  return (
    <div className="container page narrow">
      <div className="eyebrow">WE’RE HERE TO HELP</div>
      <h1>
        Let’s start a <em>conversation.</em>
      </h1>
      <p>
        Contact details and the enquiry service are awaiting operator
        confirmation.
      </p>
      <Link className="btn" to="/about">
        Our story{" "}
        <ArrowUpRight className="inline-arrow" size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}
