// People, enrolment, invitation and reauthentication layouts adapted from reference 3a9f2bf.
import React, { useState } from "react";
import { useResource, requireList } from "../api/services.js";
import { AccountError } from "../api/account.js";
import {
  Control,
  IdentityDialog,
  ResourceState,
  ServiceForm,
} from "../components/ServiceForms.jsx";
import { Field } from "./Account.jsx";
import { parseSubjects, validId } from "./Tutors.jsx";
function parseUsers(data) {
  return requireList(data).map((u) => {
    if (
      !validId(u?.id) ||
      typeof u.name !== "string" ||
      typeof u.email !== "string" ||
      !["admin", "student", "tutor"].includes(u.role) ||
      !["pending", "active", "rejected", "suspended"].includes(u.status)
    )
      throw new AccountError(
        "The user service returned an unexpected response.",
      );
    return u;
  });
}
function StatusAction({ user, status, label, reload, reason = false }) {
  return (
    <ServiceForm
      label={`${label} ${user.name}`}
      path={`/admin/users/${encodeURIComponent(user.id)}`}
      method="PATCH"
      submit={label}
      success="Account change accepted."
      onSuccess={reload}
      transform={(data) => ({
        status,
        ...(reason ? { reason: data.get("reason").trim() } : {}),
      })}
    >
      {(details) =>
        reason ? (
          <Control
            label={`Reason for ${label.toLowerCase()} ${user.name}`}
            name="reason"
            maxLength={1000}
            required
            error={details.reason}
          />
        ) : (
          <p className="muted">{label} this account’s access.</p>
        )
      }
    </ServiceForm>
  );
}
export default function Admin({ operations = false }) {
  const users = useResource("/admin/users", parseUsers),
    subjects = useResource("/subjects", parseSubjects);
  const [identity, setIdentity] = useState(false);
  return (
    <>
      <h1>
        {operations ? (
          <>
            A thoughtful
            <br />
            <em>operation.</em>
          </>
        ) : (
          <>
            Good people.
            <br />
            <em>A growing community.</em>
          </>
        )}
      </h1>
      <button className="btn secondary" onClick={() => setIdentity(true)}>
        Confirm identity for sensitive actions
      </button>
      {identity && <IdentityDialog onClose={() => setIdentity(false)} />}
      {operations ? (
        <section className="panel spaced">
          <h2>Invite an administrator</h2>
          <p>
            Invitations must be email-bound, expiring and single use. Sending a
            request does not confirm inbox delivery.
          </p>
          <ServiceForm
            label="Invite administrator"
            path="/admin/invites"
            status={201}
            submit="Email invitation"
            success="Invitation request accepted; delivery is not confirmed."
            transform={(data) => ({
              email: data.get("email").trim().toLowerCase(),
            })}
          >
            {(details) => (
              <Field
                label="New administrator email"
                name="email"
                type="email"
                maxLength={200}
                required
                error={details.email}
              />
            )}
          </ServiceForm>
        </section>
      ) : (
        <>
          <details className="panel spaced">
            <summary>Add a student account</summary>
            <p>
              The account service must send verification and password-setup
              instructions. No password is shared with the administrator.
            </p>
            <ResourceState resource={subjects}>
              <ServiceForm
                label="Add student account"
                path="/admin/students"
                status={201}
                submit="Create student account"
                disabled={!subjects.data?.length}
                success="Student account request accepted; email delivery is not confirmed."
                transform={(data) => {
                  const values = Object.fromEntries(data);
                  if (values.dob > new Date().toISOString().slice(0, 10))
                    throw new Error("Date of birth cannot be in the future.");
                  return {
                    name: values.name.trim(),
                    username: values.username,
                    email: values.email.trim().toLowerCase(),
                    dob: values.dob,
                    address: values.address,
                    subjects: [Number(values.subject)],
                  };
                }}
                onSuccess={users.reload}
              >
                {(details) => (
                  <>
                    <Field
                      label="Student full name"
                      name="name"
                      maxLength={100}
                      required
                      error={details.name}
                    />
                    <Field
                      label="Student username"
                      name="username"
                      pattern="[a-zA-Z0-9_]{3,40}"
                      required
                      error={details.username}
                    />
                    <Field
                      label="Student email"
                      name="email"
                      type="email"
                      maxLength={200}
                      required
                      error={details.email}
                    />
                    <Field
                      label="Student date of birth"
                      name="dob"
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      required
                      error={details.dob}
                    />
                    <Field
                      label="Student address"
                      name="address"
                      maxLength={255}
                      required
                      error={details.address}
                    />
                    <Control
                      as="select"
                      name="subject"
                      label="Enrollment subject"
                      required
                      error={details.subjects}
                    >
                      <option value="">Choose a subject</option>
                      {subjects.data?.map((s) => (
                        <option value={s.id} key={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Control>
                  </>
                )}
              </ServiceForm>
            </ResourceState>
          </details>
          <h2 className="spaced">Pending tutor approvals</h2>
          <ResourceState resource={users}>
            {users.data
              ?.filter((u) => u.role === "tutor" && u.status === "pending")
              .map((u) => (
                <section className="panel spaced" key={u.id}>
                  <h3>{u.name}</h3>
                  <p>{u.qualifications || "Qualifications not supplied."}</p>
                  <p>
                    {u.verified === true || u.verified === 1
                      ? "Email verified"
                      : "Email verification pending"}
                  </p>
                  <div className="management-grid">
                    <StatusAction
                      user={u}
                      status="active"
                      label="Approve"
                      reload={users.reload}
                    />
                    <StatusAction
                      user={u}
                      status="rejected"
                      label="Reject"
                      reload={users.reload}
                      reason
                    />
                  </div>
                </section>
              ))}
            {users.data?.every(
              (u) => u.role !== "tutor" || u.status !== "pending",
            ) && <p>No pending tutor approvals.</p>}
            <section className="panel spaced table-wrap">
              <table>
                <caption>Community accounts</caption>
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col">Role</th>
                    <th scope="col">Status</th>
                    <th scope="col">Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data?.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <b>{u.name}</b>
                        <small>{u.email}</small>
                      </td>
                      <td>{u.role}</td>
                      <td>{u.status}</td>
                      <td>
                        {u.role !== "admin" &&
                        u.status !== "pending" &&
                        u.status !== "rejected" ? (
                          <StatusAction
                            user={u}
                            status={
                              u.status === "active" ? "suspended" : "active"
                            }
                            label={
                              u.status === "active" ? "Suspend" : "Reactivate"
                            }
                            reason={u.status === "active"}
                            reload={users.reload}
                          />
                        ) : (
                          "No direct action"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.data?.length === 0 && <p>No accounts returned.</p>}
            </section>
          </ResourceState>
        </>
      )}
    </>
  );
}
