import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import SiteFooter from "../components/SiteFooter.jsx";
import logoUrl from "../assets/stay-logo.png";

const QR_SCRIPT = "https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js";
const SITE_DISPLAY = "trystay.org";

function slugifyShelterRef(name) {
  const s = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s.slice(0, 64);
}

function prettifyShelterName(slug) {
  if (!slug) return "Your shelter";
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const QR_SCRIPT_ID = "print-card-qrcode-script";

function loadQRCodeLib() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("No window"));
      return;
    }
    if (window.QRCode) {
      resolve(window.QRCode);
      return;
    }
    const existing = document.getElementById(QR_SCRIPT_ID);
    if (existing) {
      const finish = () => {
        if (window.QRCode) resolve(window.QRCode);
        else reject(new Error("QRCode global missing"));
      };
      if (existing.getAttribute("data-loaded") === "1") {
        finish();
        return;
      }
      existing.addEventListener("load", () => {
        existing.setAttribute("data-loaded", "1");
        finish();
      });
      existing.addEventListener("error", () => reject(new Error("QR script failed")));
      return;
    }
    const s = document.createElement("script");
    s.id = QR_SCRIPT_ID;
    s.src = QR_SCRIPT;
    s.async = true;
    s.onload = () => {
      s.setAttribute("data-loaded", "1");
      if (window.QRCode) resolve(window.QRCode);
      else reject(new Error("QRCode global missing"));
    };
    s.onerror = () => reject(new Error("Could not load QR code library"));
    document.head.appendChild(s);
  });
}

export default function PrintCard() {
  const [searchParams] = useSearchParams();
  const refParam = searchParams.get("ref");

  const refSlug = useMemo(() => slugifyShelterRef(refParam || ""), [refParam]);

  const referralUrl = useMemo(() => {
    const origin = `https://${SITE_DISPLAY}`;
    return refSlug ? `${origin}?ref=${encodeURIComponent(refSlug)}` : origin;
  }, [refSlug]);

  const shelterName = useMemo(() => {
    const raw = (refParam || "").trim();
    if (raw && (/\s/.test(raw) || raw !== refSlug)) {
      return raw;
    }
    return prettifyShelterName(refSlug);
  }, [refParam, refSlug]);

  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrError, setQrError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setQrError(null);
    setQrDataUrl("");
    (async () => {
      try {
        const QRCode = await loadQRCodeLib();
        if (cancelled || !QRCode?.toDataURL) {
          if (!cancelled && !QRCode?.toDataURL) {
            setQrError("QR library unavailable.");
          }
          return;
        }
        await new Promise((resolve, reject) => {
          QRCode.toDataURL(
            referralUrl,
            {
              width: 200,
              margin: 2,
              color: { dark: "#111111", light: "#ffffff" },
            },
            (err, url) => {
              if (err) reject(err);
              else resolve(url);
            }
          );
        }).then((url) => {
          if (!cancelled) setQrDataUrl(url);
        });
      } catch (e) {
        if (!cancelled) {
          setQrError(e?.message || "Could not create QR code.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [referralUrl]);

  return (
    <div className="print-page">
      <div className="print-page__toolbar no-print">
        <Link to="/shelter" className="print-page__back">
          ← Shelter portal
        </Link>
        <button type="button" className="btn btn-primary print-page__print-btn" onClick={() => window.print()}>
          Print this card
        </button>
      </div>

      <div className="print-card" aria-label="Stay referral card">
        <img className="print-card__logo" src={logoUrl} alt="Stay" height={44} />
        {qrDataUrl ? (
          <img className="print-card__qr" src={qrDataUrl} alt="" width={200} height={200} />
        ) : qrError ? (
          <p className="print-card__qr-fallback no-print">{qrError}</p>
        ) : (
          <div className="print-card__qr-placeholder" aria-hidden="true" />
        )}
        <h1 className="print-card__headline">Struggling with your dog&apos;s behavior?</h1>
        <p className="print-card__sub">
          Get a free AI diagnosis in 2 minutes. No account. No judgment.
        </p>
        <p className="print-card__url">{SITE_DISPLAY}</p>
        <p className="print-card__sponsor">Provided by {shelterName}</p>
      </div>
      <SiteFooter className="no-print" />
    </div>
  );
}
