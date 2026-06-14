import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { submitAsk } from "../api.js";
import { sanitizeApiErrorMessage } from "../utils/sanitizeApiErrorMessage.js";

const BACK_LINK_STYLE = {
  background: "none",
  border: "none",
  padding: 0,
  color: "#8a7a6a",
  fontSize: 14,
  cursor: "pointer",
  fontFamily: "inherit",
  textDecoration: "underline",
  marginBottom: 18,
  display: "inline-block",
};

export default function Ask({ setScreen }) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [answer, setAnswer] = useState("");

  const handleSubmit = async () => {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setAnswer("");
    try {
      const data = await submitAsk({ question: q });
      setAnswer(String(data?.answer || "").trim());
    } catch (err) {
      setError(
        sanitizeApiErrorMessage(err?.message) ||
          "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen">
      <button
        type="button"
        onClick={() => setScreen("landing")}
        style={BACK_LINK_STYLE}
      >
        ← Back
      </button>

      <h2 style={{ animation: "fadeInUp 0.25s ease forwards" }}>
        What do you want to know?
      </h2>
      <p className="subtitle">
        Ask anything about your dog&apos;s behavior. We&apos;ll give you a
        direct answer.
      </p>

      <textarea
        className="text-input"
        placeholder="e.g. My dog lunges at other dogs on leash. Is this fixable at home or do I need a trainer?"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        style={{ minHeight: 160 }}
        disabled={loading}
      />

      <div className="nav-row nav-row--question" style={{ marginTop: 16 }}>
        <button
          type="button"
          className="btn btn-primary question-primary-btn"
          disabled={loading || !question.trim()}
          onClick={handleSubmit}
        >
          {loading ? "Thinking..." : "Get an answer"}
        </button>
      </div>

      {loading ? (
        <p
          style={{
            margin: "16px 0 0",
            fontSize: 13,
            color: "#8a7a6a",
            textAlign: "center",
            fontStyle: "italic",
          }}
        >
          This usually takes about 10 seconds.
        </p>
      ) : null}

      {error ? (
        <p className="error-text" style={{ marginTop: 16 }}>
          {error}
        </p>
      ) : null}

      {answer ? (
        <section
          className="result-card"
          aria-label="Answer"
          style={{ marginTop: 24 }}
        >
          <p className="result-card-label">Answer</p>
          <ReactMarkdown
            className="result-card-markdown"
            components={{
              p: ({ node, ...props }) => (
                <p
                  {...props}
                  className="result-card-body"
                  style={{ marginBottom: "0.9rem" }}
                />
              ),
              strong: ({ node, ...props }) => (
                <strong {...props} style={{ fontWeight: 600 }} />
              ),
              ul: ({ node, ...props }) => (
                <ul
                  {...props}
                  style={{
                    margin: "0.5rem 0 0.5rem 1.25rem",
                    listStyleType: "disc",
                  }}
                />
              ),
              li: ({ node, ...props }) => (
                <li {...props} style={{ marginBottom: "0.25rem" }} />
              ),
            }}
          >
            {answer}
          </ReactMarkdown>
        </section>
      ) : null}
    </div>
  );
}
