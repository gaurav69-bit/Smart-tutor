// Profile layout and fields adapted from Gaurav's reference at 3a9f2bf.
import React, { useEffect, useState } from "react";
import { AccountError } from "../api/account.js";
import { useResource } from "../api/services.js";
import { useSession } from "../auth/Session.jsx";
import {
  Control,
  ResourceState,
  ServiceForm,
} from "../components/ServiceForms.jsx";
import { Field } from "./Account.jsx";
import { Avatar, parseSubjects, validId } from "./Tutors.jsx";
function parseProfile(value) {
  if (
    !validId(value?.id) ||
    typeof value.name !== "string" ||
    !["student", "tutor", "admin"].includes(value.role) ||
    !Array.isArray(value.subjects) ||
    !value.subjects.every(
      (id) => Number.isSafeInteger(Number(id)) && Number(id) > 0,
    )
  )
    throw new AccountError(
      "The profile service returned an unexpected response.",
    );
  return value;
}
export default function Profile() {
  const session = useSession(),
    profile = useResource("/profile", parseProfile),
    subjects = useResource("/subjects", parseSubjects);
  const [revision, setRevision] = useState(0),
    [notice, setNotice] = useState("");
  const person = profile.data;
  useEffect(() => {
    if (
      person &&
      person.role === session.account.role &&
      String(person.id) === String(session.account.id)
    )
      session.updateAccountName(person.id, person.name);
  }, [
    person,
    session.account.id,
    session.account.role,
    session.updateAccountName,
  ]);
  if (
    person &&
    (String(person.id) !== String(session.account.id) ||
      person.role !== session.account.role)
  )
    return (
      <section>
        <h1>Profile unavailable</h1>
        <p role="alert">
          The returned profile does not match the signed-in account.
        </p>
      </section>
    );
  return (
    <>
      <h1>
        Your space.
        <br />
        <em>Your story.</em>
      </h1>
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      <ResourceState resource={profile}>
        {person && (
          <>
            <p className="account-state">
              {person.role} ·{" "}
              {person.verified === true || person.verified === 1
                ? "Email verified"
                : "Email verification not confirmed"}{" "}
              · Account status:{" "}
              {["pending", "active", "rejected", "suspended"].includes(
                person.status,
              )
                ? person.status
                : "Not supplied"}
            </p>
            <section className="panel">
              <ResourceState resource={subjects}>
                <ServiceForm
                  label="Edit profile"
                  path="/profile"
                  method="PATCH"
                  submit="Update profile"
                  disabled={!subjects.data?.length}
                  transform={(data) => {
                    const values = Object.fromEntries(data);
                    try {
                      new Intl.DateTimeFormat("en", {
                        timeZone: values.timezone,
                      });
                    } catch {
                      throw new Error(
                        "Choose a valid IANA timezone, such as Australia/Sydney.",
                      );
                    }
                    return {
                      name: values.name.trim(),
                      bio: values.bio,
                      timezone: values.timezone,
                      subjects: data.getAll("subjects").map(Number),
                      ...(person.role === "tutor"
                        ? { qualifications: values.qualifications }
                        : person.role === "student"
                          ? { address: values.address }
                          : {}),
                    };
                  }}
                  onSuccess={() => {
                    setNotice("Profile changes accepted.");
                    profile.reload();
                  }}
                >
                  {(details) => (
                    <>
                      <Field
                        label="Full name"
                        name="name"
                        defaultValue={person.name}
                        maxLength={100}
                        required
                        error={details.name}
                      />
                      <Control
                        as="textarea"
                        label="About you"
                        name="bio"
                        defaultValue={person.bio || ""}
                        maxLength={3000}
                        error={details.bio}
                      />
                      {person.role === "tutor" && (
                        <Control
                          as="textarea"
                          label="Qualifications"
                          name="qualifications"
                          defaultValue={person.qualifications || ""}
                          maxLength={3000}
                          required
                          error={details.qualifications}
                        />
                      )}
                      {person.role === "student" && (
                        <Field
                          label="Home address (private)"
                          name="address"
                          defaultValue={person.address || ""}
                          maxLength={255}
                          error={details.address}
                        />
                      )}
                      <Field
                        label="Timezone (IANA name)"
                        name="timezone"
                        defaultValue={person.timezone || "Australia/Sydney"}
                        required
                        maxLength={100}
                        error={details.timezone}
                      />
                      <Control
                        as="select"
                        label="Subjects (choose one or more)"
                        name="subjects"
                        multiple
                        defaultValue={person.subjects.map(String)}
                        required
                        error={details.subjects}
                      >
                        {subjects.data?.map((s) => (
                          <option value={s.id} key={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Control>
                      {!subjects.data?.length && (
                        <p>No subjects are available for editing yet.</p>
                      )}
                      <p className="muted">
                        Email, date of birth, role and approval status cannot be
                        changed here.
                      </p>
                    </>
                  )}
                </ServiceForm>
              </ResourceState>
            </section>
            <section className="panel spaced">
              <h2>Your profile photo</h2>
              <Avatar person={person} privatePhoto large revision={revision} />
              <ServiceForm
                label="Upload profile photo"
                path="/profile/photo"
                submit="Upload photo"
                transform={(data) => {
                  const file = data.get("file");
                  if (
                    !(file instanceof File) ||
                    !file.size ||
                    !["image/jpeg", "image/png", "image/webp"].includes(
                      file.type,
                    )
                  )
                    throw new Error("Choose a still JPEG, PNG or WebP image.");
                  if (file.size > 3 * 1024 * 1024)
                    throw new Error("Choose a photo no larger than 3 MB.");
                  return data;
                }}
                onSuccess={() => {
                  setNotice("Photo upload accepted by the service.");
                  setRevision((v) => v + 1);
                  profile.reload();
                }}
              >
                {() => (
                  <Field
                    label="JPEG, PNG or WebP photo (up to 3 MB)"
                    name="file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    required
                  />
                )}
              </ServiceForm>
              <p className="muted">
                Choose a still JPEG, PNG or WebP image up to 3 MB. Photo
                visibility follows your account permissions.
              </p>
            </section>
          </>
        )}
      </ResourceState>
    </>
  );
}
