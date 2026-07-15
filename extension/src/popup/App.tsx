import { EXTENSION_NAME } from "../shared/constants";

export function App() {
  return (
    <main className="popup">
      <h1 className="popup__title">{EXTENSION_NAME}</h1>
      <p className="popup__subtitle">Chrome Extension</p>
      <p className="popup__status">Extension loaded successfully.</p>
    </main>
  );
}
