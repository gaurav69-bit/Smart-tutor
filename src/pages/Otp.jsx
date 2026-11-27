import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "../auth/Session.jsx";
import { Feedback, Field } from "./Account.jsx";
import Captcha, { captchaSiteKey } from "../components/Captcha.jsx";
export default function Otp() {
  const session = useSession(),
    navigate = useNavigate();
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [resendAt, setResendAt] = useState(
      () => session.challenge?.resendAt || Date.now() + 60000,
    ),
    [now, setNow] = useState(Date.now()),
    [captcha, setCaptcha] = useState(""),
    [reset, setReset] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  if (!session.challenge)
    return (
      <div className="container page narrow">
        <h1>Start from sign in.</h1>
        <p>Your security challenge is not stored across page refreshes.</p>
        <Link className="btn" to="/login">
          Back to sign in
        </Link>
      </div>
    );
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const remaining = Math.max(
    0,
    Math.ceil((session.challenge.expiresAt - now) / 1000),
  );
  return (
    <div className="container page narrow">
      <section className="panel">
        <h1>One little security check.</h1>
        <p>Enter the six-digit code for {session.challenge.email}.</p>
        <p role="status">
          {remaining
            ? `Code expires in ${remaining}s.`
            : "Code expired. Request another code."}
        </p>
        <Feedback error={error} message={message} />
        <form
          aria-label="Verify sign-in code"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || !remaining) return;
            const form = e.currentTarget,
              code = new FormData(form).get("code");
            setError("");
            setMessage("");
            if (captchaSiteKey && !captcha) {
              setError("Complete the security check.");
              return;
            }
            setBusy(true);
            try {
              await session.verifyOtp(code, captcha);
              form.reset();
              navigate("/dashboard", { replace: true });
            } catch (err) {
              setError(err.message);
              form.reset();
            } finally {
              setBusy(false);
              setReset((v) => v + 1);
            }
          }}
        >
          <fieldset disabled={busy || !remaining}>
            <Field
              label="Six-digit code"
              name="code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
            />
            <button className="btn">
              {busy ? "Verifying…" : "Verify and sign in"}
            </button>
          </fieldset>
        </form>
        <Captcha action="otp" onToken={setCaptcha} reset={reset} />
        <button
          className="btn secondary spaced"
          disabled={busy || wait > 0}
          onClick={async () => {
            if (captchaSiteKey && !captcha) {
              setError("Complete the security check.");
              return;
            }
            setBusy(true);
            setError("");
            setMessage("");
            try {
              await session.resendOtp(captcha);
              setMessage(
                "Your code request was accepted; this does not confirm email delivery.",
              );
              setResendAt(Date.now() + 60000);
            } catch (err) {
              setError(err.message);
              if (err.status === 429) setResendAt(Date.now() + 60000);
            } finally {
              setBusy(false);
              setReset((v) => v + 1);
            }
          }}
        >
          {wait ? `Request another code in ${wait}s` : "Request another code"}
        </button>
        <p>
          <Link to="/login">Back to sign in</Link>
        </p>
      </section>
    </div>
  );
}
