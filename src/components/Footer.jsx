import { ArrowUpRight } from "lucide-react";
// Public UI adapted from aryalgaurav365-tech/ICT301-project-2-Smart-tutor-
// apps/web/src/main.jsx at 3a9f2bf; original author Gaurav Aryal. ST-23 adapts routing/data only.
import React from "react";
import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";
export default function Footer() {
  return (
    <footer>
      <div className="container footer-main">
        <div>
          <Link to="/" className="brand">
            <span className="brand-icon">
              <BookOpen size={22} />
            </span>
            smart<span>tutor</span>
          </Link>
          <p>
            A little guidance.
            <br />A world of possibility.
          </p>
        </div>
        <div>
          <b>Keep exploring</b>
          <Link to="/tutors">Find a tutor</Link>
          <Link to="/tutorials">Learning resources</Link>
          <Link to="/register">Join the community</Link>
        </div>
        <div>
          <b>A little about us</b>
          <Link to="/about">Our story</Link>
          <Link to="/contact">Get in touch</Link>
          <Link to="/login">Your dashboard</Link>
        </div>
        <div className="footer-message">
          <span>STAY CURIOUS.</span>
          <div>
            There’s always
            <br />
            something <em>more to learn.</em>{" "}
            <ArrowUpRight
              className="inline-arrow"
              size={16}
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>
          © {new Date().getFullYear()} SmartTutor · A Group D capstone project.
        </span>
        <div>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <span>Made for curious minds. ✳</span>
        </div>
      </div>
    </footer>
  );
}
