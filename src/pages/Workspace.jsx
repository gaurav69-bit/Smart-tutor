// Scoped workspace shell adapted from reference 3a9f2bf; unrelated modules stay as previews.
import React from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { Users, LayoutDashboard, ShieldCheck } from "lucide-react";
import { RequireSession, useSession } from "../auth/Session.jsx";
import Profile from "./Profile.jsx";
import Admin from "./Admin.jsx";
import RolePage from "./RolePage.jsx";
import { Avatar } from "./Tutors.jsx";
export default function Workspace() {
  const { account } = useSession();
  return (
    <div className="container portal">
      <aside className="sidebar">
        <div className="sidebar-person">
          <Avatar person={account} />
          <div>
            <b>{account.name}</b>
            <small>{account.role} space</small>
          </div>
        </div>
        <nav aria-label="Workspace navigation">
          <NavLink to="/dashboard" end>
            <LayoutDashboard size={18} aria-hidden="true" />
            Overview
          </NavLink>
          <NavLink to="/dashboard/profile">
            <Users size={18} aria-hidden="true" />
            My profile
          </NavLink>
          {account.role === "admin" && (
            <>
              <NavLink to="/dashboard/users">
                <Users size={18} aria-hidden="true" />
                People & approvals
              </NavLink>
              <NavLink to="/dashboard/operations">
                <ShieldCheck size={18} aria-hidden="true" />
                Admin tools
              </NavLink>
            </>
          )}
        </nav>
      </aside>
      <div className="portal-main">
        <p className="muted">Signed in as {account.name}</p>
        <Routes>
          <Route index element={<RolePage role={account.role} />} />
          <Route path="profile" element={<Profile />} />
          <Route
            path="users"
            element={
              <RequireSession role="admin">
                <Admin />
              </RequireSession>
            }
          />
          <Route
            path="operations"
            element={
              <RequireSession role="admin">
                <Admin operations />
              </RequireSession>
            }
          />
          <Route
            path="*"
            element={
              <>
                <h1>Workspace page unavailable</h1>
                <p>Choose a page from the workspace navigation.</p>
              </>
            }
          />
        </Routes>
      </div>
    </div>
  );
}
