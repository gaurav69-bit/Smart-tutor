// Public UI adapted from aryalgaurav365-tech/ICT301-project-2-Smart-tutor-
// apps/web/src/main.jsx at 3a9f2bf; original author Gaurav Aryal. ST-23 adapts routing/data only.
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  ArrowRight,
  Leaf,
  Check,
  ShieldCheck,
  Users,
  Library,
  CalendarDays,
  ArrowUpRight,
} from "lucide-react";
export default function Home() {
  const [q, setQ] = useState(""),
    nav = useNavigate();
  return (
    <div>
      <div className="container hero">
        <div>
          <div className="eyebrow">— BIG IDEAS START WITH A LITTLE HELP</div>
          <h1>
            Your potential.
            <br />
            Our guidance.
            <br />
            <em>Endless possibilities.</em>
          </h1>
          <p>
            Find the right tutor, make sense of the tricky stuff, and take your
            next step with confidence. Learning feels better together.
          </p>
          <form
            className="hero-search"
            onSubmit={(e) => {
              e.preventDefault();
              nav("/tutors?q=" + encodeURIComponent(q));
            }}
          >
            <Search size={20} />
            <input
              aria-label="What would you like to learn?"
              placeholder="What would you like to learn?"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="btn" aria-label="Search tutors">
              <ArrowRight size={20} />
            </button>
          </form>
          <div className="popular">
            A little inspiration: <Link to="/tutors?q=Mathematics">Maths</Link>
            <Link to="/tutors?q=Computer">Coding</Link>
            <Link to="/tutors?q=English">English</Link>
          </div>
          <div className="hero-note">
            <span className="mini-stack">
              <b>EB</b>
              <b>MC</b>
              <b>SW</b>
            </span>
            <span>
              <strong>Different minds. Shared goals.</strong>
              <small>Personal support for your next breakthrough</small>
            </span>
          </div>
        </div>
        <div className="hero-art">
          <div className="art-ring" />
          <span className="spark s1">✳</span>
          <div className="art-top">
            <span className="art-label">YOUR NEXT CHAPTER</span>
            <div className="art-title">
              Small steps.
              <br />
              <em>Big breakthroughs.</em>
            </div>
            <div className="art-book">
              <div className="book-left">
                <span>the art of</span>
                <strong>
                  figuring
                  <br />
                  it out.
                </strong>
                <i>
                  <ArrowUpRight
                    className="inline-arrow"
                    size={16}
                    aria-hidden="true"
                  />
                </i>
              </div>
              <div className="book-right">
                <Leaf size={80} strokeWidth={1} />
                <hr />
                <span>Stay curious.</span>
              </div>
            </div>
            <small>A fresh perspective is closer than you think.</small>
          </div>
          <div className="float-card float-one">
            <span className="float-icon">
              <Check />
            </span>
            <div>
              <b>That “aha!” moment</b>
              <small>Let’s find yours.</small>
            </div>
          </div>
          <div className="float-card float-two">
            <span>✧</span>
            <b>
              Made for your kind
              <br />
              of learning.
            </b>
          </div>
          <span className="spark s2">✦</span>
        </div>
      </div>
      <div className="belief-bar">
        <div className="container">
          <span>
            <ShieldCheck />
            Thoughtful tutor approval
          </span>
          <span>
            <Users />
            One-to-one, human connection
          </span>
          <span>
            <Library />
            Resources to keep you growing
          </span>
          <span>
            <CalendarDays />
            Learning that fits your life
          </span>
        </div>
      </div>
      <section className="container section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">FOLLOW YOUR CURIOSITY</div>
            <h2>
              What’s your next <em>“I get it”?</em>
            </h2>
          </div>
          <Link className="text-link" to="/tutorials">
            Explore all subjects{" "}
            <ArrowUpRight
              className="inline-arrow"
              size={16}
              aria-hidden="true"
            />
          </Link>
        </div>
        <div className="subject-grid">
          {[
            ["Mathematics", "Numbers, meet possibility.", "peach", "∑"],
            ["Computer Science", "Build something brilliant.", "mint", "</>"],
            ["English", "Find the words. Find your voice.", "lavender", "Aa"],
            ["Physics", "Make sense of your world.", "blue", "physics"],
          ].map(([n, p, c, s]) => (
            <Link
              to={"/tutors?q=" + encodeURIComponent(n)}
              className={"subject-card " + c}
              key={n}
            >
              <div className="subject-top">
                <span>
                  {s === "physics" ? <ArrowUpRight aria-hidden="true" /> : s}
                </span>
                <ArrowUpRight size={22} />
              </div>
              <h3>{n}</h3>
              <p>{p}</p>
              <small>Find your tutor →</small>
            </Link>
          ))}
        </div>
      </section>
      <section className="tutor-section">
        <div className="container section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">GOOD PEOPLE. GREAT GUIDANCE.</div>
              <h2>
                A fresh perspective.
                <br />
                <em>A familiar face.</em>
              </h2>
            </div>
            <div>
              <p>
                Patient guides, thoughtful explanations,
                <br />
                and a little encouragement along the way.
              </p>
              <Link className="text-link" to="/tutors">
                Meet our tutors{" "}
                <ArrowUpRight
                  className="inline-arrow"
                  size={16}
                  aria-hidden="true"
                />
              </Link>
            </div>
          </div>
          <div className="empty" role="status">
            Tutor profiles will appear when the shared directory API is
            connected.
          </div>

          <p className="demo-caption">
            Live tutor profiles and platform statistics are not yet available.
            No qualifications, ratings or activity counts are claimed.
          </p>
        </div>
      </section>
      <section className="container section how">
        <div>
          <div className="eyebrow">YOUR NEXT STEP, SIMPLIFIED</div>
          <h2>
            Less overwhelm.
            <br />
            <em>More moving forward.</em>
          </h2>
          <Link className="btn" to="/register">
            Start learning today{" "}
            <ArrowUpRight
              className="inline-arrow"
              size={16}
              aria-hidden="true"
            />
          </Link>
        </div>
        <div>
          {[
            [
              "01",
              "Find your kind of tutor",
              "Explore subjects and meet a guide who gets your goals.",
            ],
            [
              "02",
              "Tell us what works for you",
              "Request a time. Our team will coordinate and confirm your session.",
            ],
            [
              "03",
              "Make your next breakthrough",
              "Connect, ask questions, and build confidence at your own pace.",
            ],
          ].map(([n, h, p]) => (
            <div className="step" key={n}>
              <span>{n}</span>
              <div>
                <h3>{h}</h3>
                <p>{p}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="container cta">
        <div className="eyebrow">GIVE YOUR CURIOSITY SOMEWHERE TO GO</div>
        <h2>
          You don’t have to figure
          <br />
          it all out <em>on your own.</em>
        </h2>
        <Link className="btn light" to="/register">
          Let’s take the first step{" "}
          <ArrowUpRight className="inline-arrow" size={16} aria-hidden="true" />
        </Link>
        <span className="cta-star">✳</span>
      </section>
    </div>
  );
}
