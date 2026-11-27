import { ArrowUpRight } from "lucide-react";
// Form layout and role fields adapted from Gaurav Aryal's reference at 3a9f2bf.
// Field/consent mapping is proposed for ST-73 review; backend owns persistence and validation.
import React, { useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { BookOpen } from "lucide-react";
import { accountRequest, safeAccount, AccountError } from "../api/account.js";
import { useSession } from "../auth/Session.jsx";
import Captcha, { captchaSiteKey } from "../components/Captcha.jsx";
const tokenPattern = /^[a-f0-9]{64}$/;
export function Feedback({ error, message }) {
  const ref = useRef(null);
  useEffect(() => {
    if (error || message) ref.current?.focus();
  }, [error, message]);
  return error ? (
    <div ref={ref} tabIndex={-1} className="alert" role="alert">
      {error}
    </div>
  ) : message ? (
    <div ref={ref} tabIndex={-1} className="success" role="status">
      {message}
    </div>
  ) : null;
}
export function Field({ label, error, ...props }) {
  const id = `account-${props.name}`;
  return (
    <label htmlFor={id}>
      {label}
      <input
        id={id}
        {...props}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </label>
  );
}
export default function Account({ register = false }) {
  const session = useSession(),
    navigate = useNavigate(),
    location = useLocation();
  const [role, setRole] = useState("student"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [details, setDetails] = useState({}),
    [created, setCreated] = useState(false);
  const [captcha, setCaptcha] = useState(""),
    [captchaReset, setCaptchaReset] = useState(0);
  useEffect(() => {
    setError("");
    setDetails({});
    setCreated(false);
    if (!register) session.cancelChallenge();
  }, [register]);
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setError("");
    setDetails({});
    if (captchaSiteKey && !captcha) {
      setError("Complete the security check before continuing.");
      return;
    }
    const invalid = {};
    if (register) {
      if (
        values.email.trim().toLowerCase() !==
        values.emailConfirm.trim().toLowerCase()
      )
        invalid.emailConfirm = "Email addresses do not match.";
      if (values.password !== values.confirm)
        invalid.confirm = "Passwords do not match.";
      if (values.dob && values.dob > new Date().toISOString().slice(0, 10))
        invalid.dob = "Date of birth cannot be in the future.";
    }
    if (Object.keys(invalid).length) {
      setDetails(invalid);
      setError("Please check the highlighted fields.");
      return;
    }
    setBusy(true);
    try {
      const email = values.email.trim().toLowerCase();
      if (register) {
        const { confirm, emailConfirm, ...profile } = values;
        const result = await accountRequest("register", {
          ...profile,
          name: profile.name.trim(),
          email,
          role,
          terms: profile.terms === "on",
          ...(captcha ? { captcha } : {}),
        });
        safeAccount(result, { registration: true });
        form.reset();
        setCreated(true);
      } else {
        const account = await session.login(email, values.password, captcha);
        form.reset();
        if (account.otpRequired) {
          navigate("/otp");
          return;
        }
        const from = location.state?.from;
        // Only local, explicitly permitted role destinations are restored.
        navigate(
          ["/dashboard", `/${account.role}`].includes(from)
            ? from
            : "/dashboard",
          { replace: true },
        );
      }
    } catch (e) {
      setError(e.message);
      setDetails(e.details || {});
      form.querySelectorAll('input[type="password"]').forEach((input) => {
        input.value = "";
      });
    } finally {
      setBusy(false);
      setCaptchaReset((value) => value + 1);
    }
  }
  return (
    <div className="container auth-page">
      <div className="auth-story">
        <div className="eyebrow">YOUR NEXT CHAPTER</div>
        <h1>
          A little support.
          <br />
          <em>A brighter path.</em>
        </h1>
        <p>
          Bring your questions, your big ideas, and your not-quite-sure-yets.
          We’ll help you find your way.
        </p>
        <div className="auth-illustration">
          <BookOpen size={90} strokeWidth={1} />
          <span>Stay curious.</span>
        </div>
      </div>
      <div className="panel auth-form">
        <div className="eyebrow">
          {register ? "LET’S BEGIN" : "GOOD TO SEE YOU AGAIN"}
        </div>
        <h2>
          {created
            ? "Check your inbox."
            : register
              ? "Make room for possibility."
              : "Welcome back."}
        </h2>
        <p>Your next breakthrough is waiting.</p>
        <Feedback
          error={error}
          message={
            created
              ? "Your account was created, but it is not yet verified. Follow the verification instructions before signing in. Account approval may also be required."
              : ""
          }
        />
        {created ? (
          <Link className="btn" to="/verify">
            Verification options{" "}
            <ArrowUpRight
              className="inline-arrow"
              size={16}
              aria-hidden="true"
            />
          </Link>
        ) : (
          <form
            onSubmit={submit}
            aria-label={register ? "Create account" : "Sign in"}
          >
            <fieldset disabled={busy}>
              {register && (
                <>
                  <div className="role-toggle" aria-label="Account role">
                    {["student", "tutor"].map((r) => (
                      <button
                        key={r}
                        type="button"
                        className={role === r ? "selected" : ""}
                        aria-pressed={role === r}
                        onClick={() => {
                          setRole(r);
                          setDetails({});
                          setError("");
                        }}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
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
                    title="3–40 letters, numbers or underscores"
                    required
                    error={details.username}
                  />
                </>
              )}
              <Field
                label="Email address"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={200}
                required
                error={details.email}
              />
              {register && (
                <Field
                  label="Confirm email"
                  name="emailConfirm"
                  type="email"
                  autoComplete="email"
                  required
                  error={details.emailConfirm}
                />
              )}
              <Field
                label="Password"
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                minLength={register ? 10 : 1}
                maxLength={128}
                required
                error={details.password}
              />
              {!register && (
                <Link className="forgot" to="/forgot-password">
                  Forgot password?
                </Link>
              )}
              {register && (
                <>
                  <Field
                    label="Confirm password"
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    error={details.confirm}
                  />
                  <Field
                    label="Subject"
                    name="subject"
                    maxLength={100}
                    placeholder={
                      role === "student"
                        ? "What would you like to learn?"
                        : "What do you teach?"
                    }
                    required
                    error={details.subject}
                  />
                  {role === "student" ? (
                    <>
                      <Field
                        label="Date of birth"
                        name="dob"
                        type="date"
                        max={new Date().toISOString().slice(0, 10)}
                        required
                        error={details.dob}
                      />
                      <Field
                        label="Home address (private)"
                        name="address"
                        autoComplete="street-address"
                        maxLength={300}
                        required
                        error={details.address}
                      />
                    </>
                  ) : (
                    <>
                      <Field
                        label="Qualifications"
                        name="qualifications"
                        maxLength={1000}
                        required
                        error={details.qualifications}
                      />
                      <label htmlFor="account-bio">
                        About your teaching
                        <textarea
                          id="account-bio"
                          name="bio"
                          maxLength={2000}
                          required
                          aria-invalid={!!details.bio}
                          aria-describedby={
                            details.bio ? "account-bio-error" : undefined
                          }
                        />
                        {details.bio && (
                          <span className="field-error" id="account-bio-error">
                            {details.bio}
                          </span>
                        )}
                      </label>
                    </>
                  )}
                  <label className="checkbox">
                    <input name="terms" type="checkbox" required />{" "}
                    <span>
                      I agree to the <Link to="/terms">Terms</Link> and{" "}
                      <Link to="/privacy">Privacy Policy</Link>.
                    </span>
                  </label>
                  {details.terms && (
                    <p className="field-error">{details.terms}</p>
                  )}
                </>
              )}
              <Captcha
                action={register ? "register" : "login"}
                onToken={setCaptcha}
                reset={captchaReset}
              />
              <button className="btn" type="submit">
                {busy
                  ? "Just a moment…"
                  : register
                    ? "Create account"
                    : "Continue"}{" "}
                <ArrowUpRight
                  className="inline-arrow"
                  size={16}
                  aria-hidden="true"
                />
              </button>
            </fieldset>
          </form>
        )}
        <div className="auth-switch">
          {register ? "Already part of the community?" : "New around here?"}{" "}
          <Link to={register ? "/login" : "/register"}>
            {register ? "Sign in" : "Create an account"}
          </Link>
        </div>
        {!register && (
          <div className="auth-switch">
            <Link to="/verify">Need to verify your email?</Link>
            <p>
              <Link to="/accept-invitation">
                Have an administrator invitation?
              </Link>
            </p>
          </div>
        )}
        <p className="dev-note">
          Development preview. Use test details only. Account services may be
          unavailable.
        </p>
      </div>
    </div>
  );
}
export function Verify() {
  const [params] = useSearchParams();
  // Support both existing HashRouter links and backend-generated /?token=...#/verify links.
  const raw =
    params.get("token") ||
    new URLSearchParams(window.location.search).get("token") ||
    "";
  const [token, setToken] = useState(raw),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [verified, setVerified] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setToken(raw);
    setError("");
    setMessage("");
    setVerified(false);
  }, [raw, location.key]);
  // Never auto-submit a single-use token: StrictMode, refresh and link scanners must not consume it.
  return (
    <div className="container page narrow">
      <h1>One step closer.</h1>
      <p>
        Confirm your email using the link you received. Verification does not
        automatically sign you in.
      </p>
      <Feedback error={error} message={message} />
      {verified ? (
        <Link className="btn" to="/login">
          Email verified. Sign in{" "}
          <ArrowUpRight className="inline-arrow" size={16} aria-hidden="true" />
        </Link>
      ) : (
        <form
          aria-label="Verify email"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setMessage("");
            if (!tokenPattern.test(token)) {
              setError("Use a valid verification token from your email link.");
              return;
            }
            setBusy(true);
            try {
              const result = await accountRequest("verify-email", { token });
              if (result?.verified !== true)
                throw new AccountError(
                  "Account services returned an unexpected verification response.",
                );
              setVerified(true);
              setToken("");
              setMessage(
                "Email verified. You can now try signing in; account approval may still be required.",
              );
              window.history.replaceState(
                null,
                "",
                `${window.location.pathname}#/verify`,
              );
            } catch (err) {
              setError(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy}>
            <Field
              label="Verification token"
              name="token"
              value={token}
              onChange={(e) => setToken(e.target.value.trim())}
              autoComplete="off"
              required
            />
            <button className="btn">
              {busy ? "Verifying…" : "Verify my email"}
            </button>
          </fieldset>
        </form>
      )}
      <Resend />
    </div>
  );
}
function Resend() {
  const [busy, setBusy] = useState(false),
    [wait, setWait] = useState(0),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!wait) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);
  return (
    <section className="panel spaced">
      <h2>Need another link?</h2>
      <Feedback error={error} message={message} />
      <form
        aria-label="Resend verification"
        onSubmit={async (e) => {
          e.preventDefault();
          const email = new FormData(e.currentTarget)
            .get("email")
            .trim()
            .toLowerCase();
          setBusy(true);
          setError("");
          setMessage("");
          try {
            await accountRequest("resend-verification", { email });
            setMessage(
              "If this address is eligible, your request has been accepted. Check your inbox; acceptance does not confirm delivery.",
            );
            setWait(60);
          } catch (err) {
            setError(err.message);
            if (err.status === 429) setWait(60);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy || wait > 0}>
          <Field
            label="Email for verification"
            name="email"
            type="email"
            maxLength={200}
            autoComplete="email"
            required
          />
          <button className="btn">
            {busy
              ? "Requesting…"
              : wait
                ? `Try again in ${wait}s`
                : "Request a new link"}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
