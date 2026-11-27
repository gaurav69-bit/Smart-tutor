import React, { useEffect, useRef } from "react";
import {
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import Header from "./components/Header.jsx";
import Footer from "./components/Footer.jsx";
import Home from "./pages/Home.jsx";
import Info from "./pages/Info.jsx";
import Account, { Verify } from "./pages/Account.jsx";
import Recovery from "./pages/Recovery.jsx";
import Directory, { Contact } from "./pages/Directory.jsx";
import RolePage from "./pages/RolePage.jsx";
import {
  RequireSession,
  SessionProvider,
  useSession,
} from "./auth/Session.jsx";
function Dashboard() {
  const session = useSession();
  return (
    <>
      <div className="container session-caption">
        Signed in as {session.account.name}
      </div>
      <RolePage role={session.account.role} />
    </>
  );
}
function Layout() {
  const { pathname } = useLocation(),
    main = useRef(null);
  useEffect(() => {
    const name = pathname.split("/")[1] || "Home";
    document.title = `${name.charAt(0).toUpperCase() + name.slice(1)} | SmartTutor`;
    main.current?.focus();
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          main.current?.focus();
        }}
      >
        Skip to content
      </a>
      <Header />
      <main id="main-content" ref={main} tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home />} />
          {["about", "privacy", "terms"].map((page) => (
            <Route key={page} path={`/${page}`} element={<Info />} />
          ))}
          <Route path="/login" element={<Account key="login" />} />
          <Route
            path="/register"
            element={<Account key="register" register />}
          />
          <Route path="/verify" element={<Verify />} />
          <Route path="/forgot-password" element={<Recovery key="forgot" />} />
          <Route path="/reset-password" element={<Recovery key="reset" reset />} />
          <Route
            path="/dashboard"
            element={
              <RequireSession>
                <Dashboard />
              </RequireSession>
            }
          />
          {["student", "tutor"].map((role) => (
            <Route
              key={role}
              path={`/${role}`}
              element={
                <RequireSession role={role}>
                  <RolePage role={role} />
                </RequireSession>
              }
            />
          ))}
          <Route
            path="/admin"
            element={
              <div className="container page">
                <h1>Administrator access</h1>
                <p>
                  Public administrator registration and administrator sessions
                  are not available in the current shared account service.
                </p>
              </div>
            }
          />
          <Route path="/tutors/*" element={<Directory />} />
          <Route path="/tutorials" element={<Directory />} />
          <Route path="/contact" element={<Contact />} />
          <Route
            path="*"
            element={
              <div className="container page">
                <h1>Page unavailable</h1>
                <p>Use the navigation to return to a SmartTutor page.</p>
              </div>
            }
          />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
export default function App() {
  return (
    <HashRouter>
      <SessionProvider>
        <Layout />
      </SessionProvider>
    </HashRouter>
  );
}
