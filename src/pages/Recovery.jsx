// Recovery layout, copy and /auth/forgot + /auth/reset paths adapted from
// Gaurav Aryal's reference at 3a9f2bf. Shared backend integration is pending ST-10.
import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { accountRequest, AccountError } from "../api/account.js";
import { Feedback, Field } from "./Account.jsx";

const tokenPattern = /^[a-f0-9]{64}$/;
export default function Recovery({ reset = false }) {
  const [params] = useSearchParams();
  const token = params.get("token") || new URLSearchParams(window.location.search).get("token") || "";
  const validToken = tokenPattern.test(token);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [wait, setWait] = useState(0);
  const [error, setError] = useState("");
  const [details, setDetails] = useState({});
  const request = useRef(null);
  useEffect(() => {
    // Removing an accepted query token must not erase the success state.
    if (done && !token) return;
    setDone(false);
    setError("");
    setDetails({});
    setBusy(false);
    return () => request.current?.abort();
  }, [token]);
  useEffect(() => {
    if (!wait) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);
  async function submit(event) {
    event.preventDefault();
    if (busy || wait || (reset && !validToken)) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setError("");
    setDetails({});
    setDone(false);
    if (reset && values.password !== values.confirm) {
      setDetails({ confirm: "Passwords do not match." });
      setError("Please check the highlighted fields.");
      return;
    }
    setBusy(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await accountRequest(reset ? "reset" : "forgot", reset
        ? { token, password: values.password }
        : { email: values.email.trim().toLowerCase() }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (typeof result?.message !== "string" || !result.message.trim())
        throw new AccountError("Account services returned an unexpected recovery response.");
      form.reset();
      // Do not display raw service text or imply inbox delivery / automatic sign-in.
      setDone(true);
      if (!reset) setWait(60);
      else window.history.replaceState(null, "", `${window.location.pathname}#/reset-password`);
    } catch (err) {
      if (controller.signal.aborted) return;
      setDetails(err.details || {});
      setError([404, 503].includes(err.status)
        ? "Password recovery is not available from account services yet. Please try again later."
        : reset && err.status === 400
          ? "This reset link may be invalid, expired or already used. Check your password or request a new link."
          : err.message);
      if (err.status === 429) setWait(60);
      form.querySelectorAll('input[type="password"]').forEach(input => { input.value = ""; });
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="container page narrow">
      <section className="panel">
        <h1>{reset ? "A fresh start." : "Let’s get you back in."}</h1>
        <p>{reset ? "Choose a new password using the reset link from your email." : "Enter your account email to request a password reset link."}</p>
        <Feedback error={error} message={done
          ? reset
            ? "Password updated. Sign in with your new password."
            : "If this address is eligible, your reset request has been accepted. Check your inbox; acceptance does not confirm delivery."
          : ""} />
        {reset && !validToken && !done ? (
          <p role="alert">This reset link is missing or invalid. Request a new reset link to continue.</p>
        ) : !(reset && done) && (
          <form aria-label={reset ? "Reset password" : "Request password reset"} onSubmit={submit}>
            <fieldset disabled={busy || wait > 0}>
              {reset ? <>
                <Field label="New password" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required error={details.password} />
                <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" minLength={10} maxLength={128} required error={details.confirm} />
              </> : <Field label="Email address" name="email" type="email" autoComplete="email" maxLength={200} required error={details.email} />}
              <button className="btn" type="submit">{busy ? "Just a moment…" : wait ? `Try again in ${wait}s` : reset ? "Update password" : "Send reset link"}</button>
            </fieldset>
          </form>
        )}
        {reset && !done && <p><Link to="/forgot-password">Request a new reset link</Link></p>}
        <p><Link to="/login">Back to sign in</Link></p>
        <p className="dev-note">Password recovery requires a connected account service. This interface does not simulate email delivery or password changes.</p>
      </section>
    </div>
  );
}
