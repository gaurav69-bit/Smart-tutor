// Public shell adapted from Gaurav Aryal's reference UI at 3a9f2bf; session logic follows PR #11.
import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { BookOpen, ArrowUpRight, Menu, LogOut } from "lucide-react";
import { useSession } from "../auth/Session.jsx";
export default function Header() {
  const session = useSession(),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const location = useLocation(),
    navigate = useNavigate(),
    toggle = useRef(null);
  useEffect(() => {
    setOpen(false);
    setError("");
  }, [location.pathname]);
  return (
    <>
      <div className="announcement">
        A little guidance can change everything.{" "}
        <Link to="/tutors">
          Find your learning partner{" "}
          <ArrowUpRight className="inline-arrow" size={16} aria-hidden="true" />
        </Link>
      </div>
      <header>
        <div className="container header-inner">
          <Link to="/" className="brand" aria-label="SmartTutor home">
            <span className="brand-icon">
              <BookOpen size={23} />
            </span>
            smart<span>tutor</span>
          </Link>
          <button
            ref={toggle}
            className="icon mobile-menu"
            aria-label="Toggle navigation"
            aria-expanded={open}
            aria-controls="main-navigation"
            onClick={() => setOpen(!open)}
          >
            <Menu />
          </button>
          <nav
            id="main-navigation"
            aria-label="Main navigation"
            className={open ? "open" : ""}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                toggle.current?.focus();
              }
            }}
          >
            <NavLink to="/tutors">Find a tutor</NavLink>
            <NavLink to="/tutorials">Explore resources</NavLink>
            <NavLink to="/about">Our story</NavLink>
          </nav>
          <div className="header-actions">
            {session.account ? (
              <>
                <Link className="btn small" to="/dashboard">
                  My dashboard{" "}
                  <ArrowUpRight
                    className="inline-arrow"
                    size={16}
                    aria-hidden="true"
                  />
                </Link>
                <button
                  className="icon"
                  aria-label="Sign out"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await session.logout();
                      navigate("/");
                    } catch (e) {
                      setError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <>
                <Link className="login-link" to="/login">
                  Log in
                </Link>
                <Link className="btn small" to="/register">
                  Get started <ArrowUpRight size={16} />
                </Link>
              </>
            )}
          </div>
        </div>
        {error && (
          <div className="container alert" role="alert">
            {error} You have not been signed out.
          </div>
        )}
      </header>
    </>
  );
}
