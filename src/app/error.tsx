"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <main style={{ padding: 40, margin: 0 }}>
      <h1>StudyHub konnte nicht geladen werden.</h1>
      <p>
        Ist die Datenbank eingerichtet? Führe zuerst <code>npm run setup</code>{" "}
        aus. Prüfe anschließend die lokale Serverausgabe.
      </p>
      <button onClick={reset}>Erneut versuchen</button>
    </main>
  );
}
