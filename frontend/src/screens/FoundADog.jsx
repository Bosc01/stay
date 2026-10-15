import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { matchFoundDog, PAWMATCH_URL } from "../api.js";
import { sanitizeApiErrorMessage } from "../utils/sanitizeApiErrorMessage.js";
import SiteFooter from "../components/SiteFooter.jsx";
import StayHeaderLogo from "../components/StayHeaderLogo.jsx";

// Only DogFaceNet gallery photos may be shown (CC BY 4.0, attributed below). A PetFace
// gallery is shown as dog IDs and scores only, under the PetFace authors' terms.
const IMAGE_GALLERIES = new Set(["dogfacenet"]);

export default function FoundADog() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // The preview stays in this browser tab; nothing is saved.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await matchFoundDog(file));
    } catch (e) {
      setError(sanitizeApiErrorMessage(e.message || "Matching failed."));
    } finally {
      setLoading(false);
    }
  };

  const showImages = result && IMAGE_GALLERIES.has(result.gallery);

  return (
    <div className="app">
      <div className="app-frame">
        <header className="app-header">
          <Link to="/" className="logo logo-link" aria-label="Stay, home">
            <StayHeaderLogo />
          </Link>
        </header>
        <main className="app-main found-dog-page">
          <h1 className="found-dog-page__headline">Found a dog?</h1>

          <p className="found-dog-page__demo" role="note">
            <strong>This is a demo.</strong> It compares your photo with a public
            research collection of dog photos, not with real lost-dog reports.
            Your photo is used once to find similar dogs and is never stored, and
            nothing else about you is collected.
          </p>

          {PAWMATCH_URL ? (
            <form className="found-dog-page__form" onSubmit={onSubmit}>
              <label className="found-dog-page__upload">
                A clear photo of the dog&apos;s face
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setResult(null);
                  }}
                />
              </label>
              {preview ? (
                <img className="found-dog-page__preview" src={preview} alt="The photo you chose" />
              ) : null}
              <button type="submit" className="btn btn-primary" disabled={!file || loading}>
                {loading ? "Matching…" : "Find similar dogs"}
              </button>
            </form>
          ) : (
            <p className="error-text">The matching demo is not available right now.</p>
          )}

          {error ? <p className="error-text">{error}</p> : null}

          {result ? (
            <section className="found-dog-page__results" aria-live="polite">
              <p className="found-dog-page__confidence">
                {result.confidence === "confident_match"
                  ? "The top result is a confident match."
                  : "No confident match. These are the most similar dogs."}
              </p>
              {result.face?.note ? <p className="found-dog-page__muted">{result.face.note}</p> : null}
              <ol className="found-dog-page__matches">
                {result.matches.map((m) => (
                  <li key={m.dog_id} className="found-dog-page__match">
                    {showImages && m.image_url ? (
                      <img src={`${PAWMATCH_URL}${m.image_url}`} alt={`Dog ${m.dog_id}`} loading="lazy" />
                    ) : null}
                    <span>Dog {m.dog_id}</span>
                    <span className="found-dog-page__muted">similarity {m.score.toFixed(3)}</span>
                  </li>
                ))}
              </ol>
              <p className="found-dog-page__muted">{result.confidence_calibration}</p>
              {result.gallery !== "dogfacenet" ? (
                <p className="found-dog-page__muted">{result.attribution}</p>
              ) : null}
            </section>
          ) : null}

          <p className="found-dog-page__attribution">
            Gallery photos: DogFaceNet, licensed CC BY 4.0. Guillaume Mougeot,
            &ldquo;The DogFaceNet datasets&rdquo;, Zenodo, 2024,{" "}
            <a href="https://doi.org/10.5281/zenodo.12578449">doi:10.5281/zenodo.12578449</a>.
            Face detector trained on the Oxford-IIIT Pet dataset, licensed{" "}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. O. M. Parkhi,
            A. Vedaldi, A. Zisserman, C. V. Jawahar, &ldquo;Cats and Dogs&rdquo;, CVPR 2012.
            Matching by PawMatch.
          </p>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
