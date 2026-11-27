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
      "SmartTutor is a Group D KOI capstone project bringing students and tutors together. The current release supports student and tutor registration, email verification and account sign-in. Tutor discovery, learning resources and booking features are being developed in later project increments. No tutor accreditation or endorsement is claimed.",
    ],
    "/privacy": [
      "Your learning. Your privacy.",
      "Project privacy notice, pending operator approval: the account service handles names, usernames, email addresses, subject information and recorded terms consent. Student registration also collects date of birth and address; tutor registration collects qualifications and a teaching biography. Passwords are hashed, and verification, account-email and session records support account access. A session cookie keeps signed-in requests associated with the account. Student birth dates and addresses are not public profile information. Messaging, public reviews and contact enquiries are not available in this release. Retention periods, age/guardian rules, operator contact details and data-request procedures still require approval. Use synthetic test details while those decisions remain open.",
    ],
    "/terms": [
      "A shared space. A little respect.",
      "Project terms, pending operator approval: this release provides account registration, verification and sign-in. Keep account credentials private and use synthetic details for project demonstrations. Tutor discovery, bookings, shared learning resources and reviews are not available yet; account registration does not confirm a tutoring session or endorse a tutor’s qualifications. No payments are processed. Service rules, operator contact details and final terms must be approved before public use.",
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
