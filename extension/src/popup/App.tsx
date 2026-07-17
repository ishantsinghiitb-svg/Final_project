import logoMark from "../assets/icons/icon-48.png";

/**
 * "NextOffer" stays the primary visual brand — displayed on its own as the
 * title — with "AI Job Copilot" as the tagline underneath, rather than
 * cramming the full `EXTENSION_NAME` ("NextOffer – AI Job Copilot") into the
 * h1.
 */
export function App() {
  return (
    <main className="popup">
      <img className="popup__logo" src={logoMark} width="40" height="40" alt="" />
      <h1 className="popup__title">NextOffer</h1>
      <p className="popup__subtitle">AI Job Copilot</p>
      <p className="popup__status">Extension loaded successfully.</p>
    </main>
  );
}
