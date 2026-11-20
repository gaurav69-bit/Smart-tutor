import React from "react";
import { Link } from "react-router-dom";
import ApiStatus from "../components/ApiStatus.jsx";

export default function Home() {
  return (
    <div className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">A shared space for learning</p>
          <h1>
            Learning starts with
            <br />
            the right connection.
          </h1>
          <p className="intro">
            SmartTutor brings students, tutors and administrators together to
            organise tutoring and learning resources.
          </p>
          <Link className="button" to="/student">
            Explore the student page <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <aside className="preview-note">
          <span className="preview-label">Frontend preview</span>
          <h2>
            One platform.
            <br />
            Three perspectives.
          </h2>
          <p>
            Explore the starting layouts for each role. Booking, resources and
            account features will be connected in later contributions.
          </p>
          <Link to="/tutor">
            View the tutor page <span aria-hidden="true">→</span>
          </Link>
        </aside>
      </section>
      <section className="role-section" aria-labelledby="roles-heading">
        <h2 id="roles-heading">Find your workspace</h2>
        <div className="card-grid">
          <Link className="workspace-card" to="/student">
            <h3>Student</h3>
            <p>A place for sessions and learning resources.</p>
            <span>Explore student layout →</span>
          </Link>
          <Link className="workspace-card" to="/tutor">
            <h3>Tutor</h3>
            <p>A place for availability and shared materials.</p>
            <span>Explore tutor layout →</span>
          </Link>
          <Link className="workspace-card" to="/admin">
            <h3>Admin</h3>
            <p>A place for coordination and platform oversight.</p>
            <span>Explore admin layout →</span>
          </Link>
        </div>
      </section>
      <ApiStatus />
    </div>
  );
}
