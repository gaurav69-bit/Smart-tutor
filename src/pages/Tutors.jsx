// Public tutor layouts/copy adapted from Gaurav Aryal's reference at 3a9f2bf.
import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Search, Star } from "lucide-react";
import { AccountError } from "../api/account.js";
import { apiBase, requireList, useResource } from "../api/services.js";
import { ResourceState } from "../components/ServiceForms.jsx";
export const validId = (value) =>
  ["string", "number"].includes(typeof value) &&
  /^[a-zA-Z0-9_-]{1,80}$/.test(String(value));
export function parseSubjects(data) {
  return requireList(data).map((item) => {
    if (
      !Number.isSafeInteger(Number(item?.id)) ||
      Number(item.id) <= 0 ||
      typeof item.name !== "string"
    )
      throw new AccountError(
        "The subject service returned an unexpected response.",
      );
    return { id: item.id, name: item.name };
  });
}
export function parseTutors(data) {
  return requireList(data)
    .map((t) => {
      if (
        !validId(t?.id) ||
        typeof t.name !== "string" ||
        typeof t.bio !== "string" ||
        !Array.isArray(t.subjects)
      )
        throw new AccountError(
          "The tutor service returned an unexpected response.",
        );
      return {
        id: t.id,
        name: t.name,
        bio: t.bio,
        qualifications:
          typeof t.qualifications === "string" ? t.qualifications : "",
        subjects: parseSubjects(t.subjects),
        photo: !!t.photo,
        rating:
          typeof t.rating === "number" && t.rating >= 1 && t.rating <= 5
            ? t.rating
            : null,
        reviews: Array.isArray(t.reviews)
          ? t.reviews.filter(
              (r) =>
                validId(r?.id) &&
                typeof r.name === "string" &&
                typeof r.body === "string" &&
                Number.isInteger(r.rating) &&
                r.rating >= 1 &&
                r.rating <= 5,
            )
          : [],
        availability: Array.isArray(t.availability)
          ? t.availability.filter(
              (a) =>
                validId(a?.id) &&
                Number.isFinite(Date.parse(a.starts_at)) &&
                Date.parse(a.ends_at) > Date.parse(a.starts_at),
            )
          : [],
        status: t.status,
      };
    })
    .filter((t) => t.status === undefined || t.status === "active");
}
export function Avatar({
  person,
  large = false,
  privatePhoto = false,
  revision = 0,
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [person.id, person.photo, revision]);
  return person.photo && !failed ? (
    <img
      className={`avatar avatar-photo ${large ? "large" : ""}`}
      alt={person.name}
      src={`${apiBase}${privatePhoto ? "/profile/photo" : `/users/${encodeURIComponent(person.id)}/photo`}?v=${revision}`}
      onError={() => setFailed(true)}
    />
  ) : (
    <span className={`avatar ${large ? "large" : ""}`} aria-label={person.name}>
      {person.name
        .split(/\s+/)
        .map((v) => v[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
function TutorCard({ tutor: t, index }) {
  return (
    <article className="tutor-card">
      <div className={`portrait tone${index % 3}`}>
        <Avatar person={t} large />
      </div>
      <div className="tutor-content">
        <div className="tutor-title">
          <h2>{t.name}</h2>
          <span className="rating">
            <Star size={13} aria-hidden="true" />
            {t.rating ? t.rating.toFixed(1) : "No ratings yet"}
          </span>
        </div>
        <p className="tutor-subjects">
          {t.subjects.map((s) => s.name).join(" · ")}
        </p>
        <p className="tutor-bio">{t.bio}</p>
        <Link className="tutor-link" to={`/tutors/${encodeURIComponent(t.id)}`}>
          Get to know {t.name.split(" ")[0]}{" "}
          <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
export default function Tutors() {
  const resource = useResource("/tutors", parseTutors),
    { id } = useParams(),
    [params, setParams] = useSearchParams();
  const q = params.get("q") || "",
    subject = params.get("subject") || "";
  const requestedPage = Math.max(
    1,
    Number.parseInt(params.get("page"), 10) || 1,
  );
  const [query, setQuery] = useState(q);
  useEffect(() => setQuery(q), [q]);
  const tutors = resource.data || [],
    subjects = [
      ...new Map(
        tutors.flatMap((t) => t.subjects).map((s) => [String(s.id), s]),
      ).values(),
    ];
  const filtered = tutors.filter(
    (t) =>
      `${t.name} ${t.bio} ${t.subjects.map((s) => s.name).join(" ")}`
        .toLowerCase()
        .includes(q.toLowerCase()) &&
      (!subject || t.subjects.some((s) => String(s.id) === subject)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 6)),
    page = Math.min(requestedPage, pages);
  function update(values) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values))
      value ? next.set(key, String(value)) : next.delete(key);
    setParams(next);
  }
  if (id) {
    const tutor = tutors.find((t) => String(t.id) === id);
    return (
      <div className="container page">
        <Link className="text-link" to="/tutors">
          ← All tutors
        </Link>
        <ResourceState resource={resource}>
          {tutor ? (
            <div className="profile-grid">
              <section className="panel">
                <Avatar person={tutor} large />
                <h1 className="spaced">{tutor.name}</h1>
                <p>{tutor.subjects.map((s) => s.name).join(" · ")}</p>
                <p>{tutor.bio}</p>
                <h2>Qualifications</h2>
                <p>{tutor.qualifications || "Not supplied."}</p>
                <h2>Student feedback</h2>
                {tutor.reviews.length ? (
                  tutor.reviews.map((r) => (
                    <article className="list-item" key={r.id}>
                      <b>
                        {r.name} · {r.rating}/5
                      </b>
                      <p>{r.body}</p>
                    </article>
                  ))
                ) : (
                  <p>No reviews yet.</p>
                )}
              </section>
              <aside className="panel">
                <h2>Make time for your goals.</h2>
                <p>
                  Upcoming availability is shown in your device’s local
                  timezone.
                </p>
                {tutor.availability.length ? (
                  tutor.availability.map((a) => (
                    <p className="list-item" key={a.id}>
                      {new Date(a.starts_at).toLocaleString()} —{" "}
                      {new Date(a.ends_at).toLocaleString()}
                    </p>
                  ))
                ) : (
                  <p>No availability published.</p>
                )}
                <p>
                  Booking requests will be connected in the scheduling
                  contribution.
                </p>
              </aside>
            </div>
          ) : (
            <section className="panel">
              <h1>Tutor unavailable</h1>
              <p>This profile is not available in the public directory.</p>
            </section>
          )}
        </ResourceState>
      </div>
    );
  }
  return (
    <div className="container page">
      <div className="eyebrow">A LITTLE HELP GOES A LONG WAY</div>
      <h1>
        Find your <em>learning partner.</em>
      </h1>
      <p>Good questions deserve great guidance. Meet someone who can help.</p>
      <form
        className="search-toolbar"
        aria-label="Search tutor directory"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: query.trim(), page: "" });
        }}
      >
        <Search size={20} aria-hidden="true" />
        <input
          aria-label="Search tutors"
          maxLength={200}
          placeholder="Search by subject, tutor name, or keyword"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn" type="submit">
          Search
        </button>
      </form>
      <div className="filter-row">
        <label>
          Subject
          <select
            value={subject}
            onChange={(e) => update({ subject: e.target.value, page: "" })}
          >
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ResourceState resource={resource}>
        {filtered.length ? (
          <>
            <p role="status">
              {filtered.length} tutors · Page {page} of {pages}
            </p>
            <div className="tutor-grid">
              {filtered.slice((page - 1) * 6, page * 6).map((t, i) => (
                <TutorCard tutor={t} index={i} key={t.id} />
              ))}
            </div>
            <nav className="row-actions spaced" aria-label="Tutor pages">
              <button
                className="btn secondary"
                disabled={page === 1}
                onClick={() => update({ page: page - 1 })}
              >
                Previous page
              </button>
              <button
                className="btn secondary"
                disabled={page === pages}
                onClick={() => update({ page: page + 1 })}
              >
                Next page
              </button>
            </nav>
          </>
        ) : (
          <p role="status">No tutors match these filters.</p>
        )}
      </ResourceState>
    </div>
  );
}
