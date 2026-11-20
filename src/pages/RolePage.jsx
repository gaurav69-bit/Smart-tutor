import React from 'react';

export const rolePages = {
  student: {
    title: 'Student', heading: 'Your learning workspace',
    description: 'The starting layout for finding resources and keeping track of tutoring sessions.',
    panels: ['Upcoming sessions', 'Learning resources', 'Messages'],
  },
  tutor: {
    title: 'Tutor', heading: 'Your teaching workspace',
    description: 'The starting layout for organising availability, teaching materials and student conversations.',
    panels: ['Teaching sessions', 'Availability', 'Shared materials'],
  },
  admin: {
    title: 'Admin', heading: 'Your coordination workspace',
    description: 'The starting layout for coordinating users, tutoring sessions and learning content.',
    panels: ['User overview', 'Session coordination', 'Content overview'],
  },
};

export default function RolePage({ role }) {
  const page = rolePages[role];
  return (
    <div className="page role-page">
      <p className="eyebrow">{page.title} page skeleton</p>
      <h1>{page.heading}</h1>
      <p className="intro">{page.description}</p>
      <div className="preview-banner">Preview only. Role access and live account data are pending team integration.</div>
      <div className="card-grid">
        {page.panels.map((title) => (
          <section className="placeholder-card" key={title}>
            <h2>{title}</h2>
            <div className="skeleton-lines" aria-hidden="true"><span /><span /><span /></div>
            <p>Feature integration pending.</p>
          </section>
        ))}
      </div>
    </div>
  );
}
