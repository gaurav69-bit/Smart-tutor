import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ServiceForm } from "../components/ServiceForms.jsx";
import { Field } from "./Account.jsx";
import Captcha, { captchaSiteKey } from "../components/Captcha.jsx";
import { AccountError } from "../api/account.js";
import { validId } from "./Tutors.jsx";
export default function Invitation() {
  const [params] = useSearchParams(),
    [done, setDone] = useState(false),
    [captcha, setCaptcha] = useState(""),
    [reset, setReset] = useState(0);
  return (
    <div className="container page narrow">
      <section className="panel">
        <h1>Your invitation to help.</h1>
        <p>
          Use the administrator invitation sent to your email. An invitation is
          intended for one recipient and can only be used once.
        </p>
        {done ? (
          <p role="status">
            Invitation registration accepted. Follow email verification
            instructions before trying to sign in.
          </p>
        ) : (
          <ServiceForm
            label="Accept administrator invitation"
            path="/auth/register"
            status={201}
            submit="Accept invitation"
            parseResult={(value) => {
              if (
                !validId(value?.account?.id) ||
                value.account.role !== "admin" ||
                value.account.verified !== false
              )
                throw new AccountError(
                  "The invitation service returned an unexpected response.",
                );
              return value;
            }}
            transform={(data) => {
              const values = Object.fromEntries(data);
              if (values.password !== values.confirm)
                throw new Error("Passwords do not match.");
              if (!/^[a-f0-9]{64}$/.test(values.invite.trim()))
                throw new Error("Use the invitation token from your email.");
              if (captchaSiteKey && !captcha)
                throw new Error("Complete the security check.");
              return {
                name: values.name.trim(),
                username: values.username,
                email: values.email.trim().toLowerCase(),
                password: values.password,
                invite: values.invite.trim(),
                role: "admin",
                terms: values.terms === "on",
                ...(captcha ? { captcha } : {}),
              };
            }}
            onSuccess={() => {
              setDone(true);
              window.history.replaceState(
                null,
                "",
                `${window.location.pathname}#/accept-invitation`,
              );
            }}
            onAttempt={() => setReset((v) => v + 1)}
          >
            {(details) => (
              <>
                <Field
                  label="Full name"
                  name="name"
                  autoComplete="name"
                  maxLength={100}
                  required
                  error={details.name}
                />
                <Field
                  label="Username"
                  name="username"
                  autoComplete="username"
                  pattern="[a-zA-Z0-9_]{3,40}"
                  required
                  error={details.username}
                />
                <Field
                  label="Invited email address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  defaultValue={params.get("email") || ""}
                  maxLength={200}
                  required
                  error={details.email}
                />
                <Field
                  label="Invitation token"
                  name="invite"
                  autoComplete="off"
                  defaultValue={params.get("invite") || ""}
                  required
                  error={details.invite}
                />
                <Field
                  label="Password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  required
                  error={details.password}
                />
                <Field
                  label="Confirm password"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  required
                />
                <label className="checkbox">
                  <input type="checkbox" name="terms" required />
                  <span>
                    I agree to the <Link to="/terms">Terms</Link> and{" "}
                    <Link to="/privacy">Privacy Policy</Link>.
                  </span>
                </label>
                <Captcha action="register" onToken={setCaptcha} reset={reset} />
              </>
            )}
          </ServiceForm>
        )}
        <p>
          <Link to="/login">Back to sign in</Link>
        </p>
      </section>
    </div>
  );
}
