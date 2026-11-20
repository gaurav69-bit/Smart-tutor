import React, { useEffect, useRef } from "react";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import Header from "./components/Header.jsx";
import Footer from "./components/Footer.jsx";
import Home from "./pages/Home.jsx";
import RolePage, { rolePages } from "./pages/RolePage.jsx";

function Layout() {
  const { pathname } = useLocation();
  const main = useRef(null);
  useEffect(() => {
    document.title = `${rolePages[pathname.slice(1)]?.title || "Home"} | SmartTutor`;
    main.current?.focus();
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          main.current?.focus();
        }}
      >
        Skip to content
      </a>
      <Header />
      <main id="main-content" ref={main} tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home />} />
          {Object.keys(rolePages).map((role) => (
            <Route
              key={role}
              path={`/${role}`}
              element={<RolePage role={role} />}
            />
          ))}
          <Route
            path="*"
            element={
              <section className="page">
                <h1>Page unavailable</h1>
                <p>Use the navigation to return to a SmartTutor page.</p>
              </section>
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
      <Layout />
    </HashRouter>
  );
}
