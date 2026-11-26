import { ArrowUpRight } from "lucide-react";
// Public UI adapted from aryalgaurav365-tech/ICT301-project-2-Smart-tutor-
// apps/web/src/main.jsx at 3a9f2bf; original author Gaurav Aryal. ST-23 adapts routing/data only.
import React from "react";
import { Link, useLocation } from "react-router-dom";
export default function Info() {
  const page = useLocation().pathname;
  const data = {
    "/about": [
      "A little guidance. A world of possibility.",
      "SmartTutor brings students, tutors, and human encouragement together. Built as a Group D KOI capstone project, our purpose is to make academic support simpler to find and coordinate. This development version contains illustrative profiles and no claimed accreditation.",
    ],
    "/privacy": [
      "Your learning. Your privacy.",
      "Development notice, pending operator review: we store account details, hashed passwords, verification records, sessions, messages, views and contact enquiries to operate the service. Date of birth and address are private. Reviews display the student name publicly. Do not enter real or sensitive data in this demo. Retention, age/guardian policy, operator contacts and data-request procedures must be finalized before launch.",
    ],
    "/terms": [
      "A shared space. A little respect.",
      "Development terms, pending review: share only content you have permission to use. A request becomes a booking only when an administrator assigns it. Contact admin for cancellations. Sessions take place outside the platform. No payments are processed. Tutor credential verification is the operator’s responsibility.",
    ],
  }[page];
  return (
    <div className="container page narrow prose">
      <div className="eyebrow">SMARTTUTOR</div>
      <h1>{data?.[0] || "A little off course?"}</h1>
      <p>{data?.[1] || "That page isn’t here. Let’s get you back."}</p>
      <Link className="btn" to="/">
        Back home{" "}
        <ArrowUpRight className="inline-arrow" size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}
