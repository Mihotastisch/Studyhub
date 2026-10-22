import Link from "next/link";
import { DateTime } from "luxon";
import { db } from "@/lib/db";
import { currentWeek, format, ZONE } from "@/lib/time";
import { LocalMailProvider } from "@/providers/contracts";
import { mutate } from "./actions";
import { SubscriptionSubmit } from "./subscription-submit";
export const dynamic = "force-dynamic";
const local = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");
function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}
function Submit({ children = "Speichern" }: { children?: React.ReactNode }) {
  return (
    <button className="primary" type="submit">
      {children}
    </button>
  );
}
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; message?: string }>;
}) {
  const params = await searchParams;
  const offset = Math.trunc(
    Math.max(-104, Math.min(104, Number(params.week) || 0)),
  );
  const week = currentWeek(offset),
    now = DateTime.now().setZone(ZONE),
    today = now.startOf("day");
  const [courses, events, tasks, exams, sources] = await Promise.all([
    db.course.findMany({ orderBy: { title: "asc" } }),
    db.calendarEvent.findMany({
      where: {
        start: { lt: week.plus({ weeks: 1 }).toJSDate() },
        end: { gte: week.toJSDate() },
      },
      include: { course: true, source: { select: { name: true } } },
      orderBy: { start: "asc" },
    }),
    db.task.findMany({
      include: { course: true, source: { select: { name: true } } },
      orderBy: { dueAt: "asc" },
    }),
    db.exam.findMany({
      include: { course: true, source: { select: { name: true } } },
      orderBy: { dueAt: "asc" },
    }),
    db.syncSource.findMany({
      select: {
        id: true,
        name: true,
        kind: true,
        lastSyncedAt: true,
        subscriptionFrom: true,
        subscriptionTo: true,
      },
    }),
  ]);
  const todays = await db.calendarEvent.findMany({
    where: {
      start: { lt: today.plus({ days: 1 }).toJSDate() },
      end: { gt: today.toJSDate() },
    },
    include: { source: { select: { name: true } } },
    orderBy: { start: "asc" },
  });
  const deadlines = [
    ...tasks.filter((t) => !t.done).map((t) => ({ ...t, kind: "task" })),
    ...exams.map((t) => ({ ...t, kind: "exam" })),
  ].sort((a, b) => +a.dueAt - +b.dueAt);
  const reminders = deadlines.filter(
    (t) =>
      t.reminderMinutes !== null &&
      +t.dueAt - t.reminderMinutes * 60000 <= +now &&
      +t.dueAt >= +today,
  );
  const mail = new LocalMailProvider().getWebmailUrl();
  const courseSelect = (selected?: string | null) => (
    <label>
      Modul
      <select name="courseId" defaultValue={selected || ""}>
        <option value="">Ohne Modul</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="shell">
      <aside>
        <Link href="/" className="brand">
          <span className="logo">S</span> StudyHub
          <span className="version">0.1</span>
        </Link>
        <p className="eyebrow">DEIN STUDIENALLTAG</p>
        <nav>
          <a href="#dashboard" className="active">
            ◫ <span>Übersicht</span>
          </a>
          <a href="#calendar">
            ▦ <span>Wochenkalender</span>
          </a>
          <a href="#courses">
            ▤ <span>Veranstaltungen</span>
          </a>
          <a href="#deadlines">
            ✓ <span>Aufgaben & Klausuren</span>
          </a>
          <a href="#import">
            ⇧ <span>Kalender importieren</span>
          </a>
          <a href="#subscription">
            ↻ <span>Kalender abonnieren</span>
          </a>
        </nav>
        <div className="local-note">
          <span className="dot" /> Lokal & privat
          <p>
            Deine Daten werden lokal gespeichert. Kalenderlinks werden nur auf
            deinen Klick abgerufen.
          </p>
        </div>
        <div className="profile">
          <span>ST</span>
          <div>
            Mein Studium<small>Universität Bayreuth</small>
          </div>
        </div>
      </aside>
      <main id="dashboard">
        <header>
          <span>
            Mein Workspace <span className="muted">/ Übersicht</span>
          </span>
          <span className="pill">◉ Lokaler Modus</span>
        </header>
        <div className="intro">
          <div>
            <p className="eyebrow">
              {now.setLocale("de").toFormat("cccc, dd. MMMM yyyy")}
            </p>
            <h1>Dein Studium. Im Überblick.</h1>
            <p className="muted">
              Ein klarer Kopf beginnt mit einem guten Plan.
            </p>
          </div>
          <a href="#import" className="primary">
            ＋ Kalender importieren
          </a>
        </div>
        {params.message && (
          <p className="notice" role="status">
            {params.message}
          </p>
        )}
        {sources.some((s) => s.kind === "DEMO") && (
          <div className="demo">
            DEMO-DATEN{" "}
            <span>
              Die Beispieldaten sind frei erfunden und keine offiziellen
              Uni-Termine.
            </span>
          </div>
        )}
        {reminders.length > 0 && (
          <div className="notice">
            Erinnerungen: {reminders.map((t) => t.title).join(" · ")}
          </div>
        )}
        <section className="stats">
          <article className="card">
            <span className="stat-icon">▦</span>
            <p>Heute auf dem Plan</p>
            <strong>
              {todays.length}
              <small> Veranstaltungen</small>
            </strong>
            <span className="muted">
              {todays[0]
                ? `${format(todays[0].start, "HH:mm")} · ${todays[0].title}`
                : "Zeit für deinen eigenen Lernplan"}
            </span>
          </article>
          <article className="card">
            <span className="stat-icon amber">◷</span>
            <p>Offene Aufgaben</p>
            <strong>
              {tasks.filter((t) => !t.done).length}
              <small> im Blick behalten</small>
            </strong>
            <span className="muted">
              {deadlines[0]
                ? `Nächste Frist: ${format(deadlines[0].dueAt, "dd. MMM")}`
                : "Alles erledigt"}
            </span>
          </article>
          <article className="card">
            <span className="stat-icon violet">▤</span>
            <p>Neue Lernmaterialien</p>
            <strong>
              0<small> neue Dateien</small>
            </strong>
            <span className="muted">e-Learning noch nicht verbunden</span>
          </article>
          <article className="card">
            <span className="stat-icon blue">✉</span>
            <p>Uni-Webmail</p>
            <strong className="mail-title">Dein Postfach</strong>
            {mail ? (
              <a href={mail} target="_blank" rel="noreferrer">
                Webmail öffnen ↗
              </a>
            ) : (
              <span className="muted">Webmail-Link noch konfigurieren</span>
            )}
          </article>
        </section>
        <section id="calendar" className="card calendar">
          <div className="section-heading">
            <div>
              <h2>Deine Woche</h2>
              <p className="muted">
                {week.toFormat("dd. MMM")} –{" "}
                {week.plus({ days: 6 }).toFormat("dd. MMM yyyy")} ·
                Europe/Berlin
              </p>
            </div>
            <div className="week-nav">
              <Link
                href={`/?week=${offset - 1}#calendar`}
                aria-label="Vorherige Woche"
              >
                ‹
              </Link>
              <Link href="/#calendar">Heute</Link>
              <Link
                href={`/?week=${offset + 1}#calendar`}
                aria-label="Nächste Woche"
              >
                ›
              </Link>
            </div>
          </div>
          <div className="week-scroll">
            <div className="week-grid">
              {Array.from({ length: 7 }, (_, i) => {
                const day = week.plus({ days: i });
                const dayEvents = events.filter(
                  (e) => +e.start < +day.plus({ days: 1 }) && +e.end > +day,
                );
                return (
                  <div className="day" key={i}>
                    <div
                      className={`day-heading ${day.hasSame(now, "day") ? "is-today" : ""}`}
                    >
                      <span>{day.setLocale("de").toFormat("ccc")}</span>
                      <b>{day.day}</b>
                    </div>
                    <div className="day-events">
                      {dayEvents.length ? (
                        dayEvents.map((e) => (
                          <div
                            className="event"
                            key={e.id}
                            style={{
                              borderLeftColor: e.course?.color || "#0f766e",
                            }}
                          >
                            <span>
                              {e.allDay
                                ? "Ganztägig"
                                : `${format(e.start, "HH:mm")}–${format(e.end, "HH:mm")}`}
                            </span>
                            <strong>{e.title}</strong>
                            <small>⌖ {e.location || "Raum offen"}</small>
                            <small className="source">{e.source.name}</small>
                            {e.missingFromFeed && (
                              <small className="overdue">
                                Nicht im letzten Abruf – prüfen
                              </small>
                            )}
                            {e.sourceId === "local" && (
                              <form action={mutate}>
                                <Hidden name="action" value="deleteEvent" />
                                <Hidden name="id" value={e.id} />
                                <button className="text-button">Löschen</button>
                              </form>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="empty-day">Keine Termine</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="calendar-footer">
            <span>
              <i className="dot" /> Dein persönlicher Stundenplan
            </span>
            <a href="#event-form">＋ Termin hinzufügen</a>
          </div>
        </section>
        <div className="two-col">
          <section className="card" id="deadlines">
            <div className="section-heading">
              <h2>Nächste Fristen</h2>
              <span className="pill">{deadlines.length} offen</span>
            </div>
            {deadlines.slice(0, 8).map((t) => (
              <div className="deadline" key={t.id}>
                <span
                  className={`deadline-icon ${t.kind === "exam" ? "amber" : ""}`}
                >
                  {t.kind === "exam" ? "▤" : "✓"}
                </span>
                <div>
                  <strong>{t.title}</strong>
                  <small>
                    {t.course?.title || "Ohne Modul"} · {t.source.name}
                  </small>
                  <p>{t.description}</p>
                  <span className={+t.dueAt < +now ? "overdue" : "muted"}>
                    {format(t.dueAt)}
                    {+t.dueAt < +now ? " · Überfällig" : ""}
                  </span>
                </div>
                {t.kind === "task" && (
                  <form action={mutate}>
                    <Hidden name="action" value="done" />
                    <Hidden name="id" value={t.id} />
                    <Hidden name="done" value="true" />
                    <button className="text-button">Erledigt</button>
                  </form>
                )}
              </div>
            ))}
            {!deadlines.length && (
              <p className="empty">Keine offenen Fristen. Gut organisiert!</p>
            )}
          </section>
          <section className="card">
            <h2>Heute auf dem Campus</h2>
            {todays.length ? (
              todays.map((e) => (
                <div className="today-event" key={e.id}>
                  <b>{format(e.start, "HH:mm")}</b>
                  <div>
                    <strong>{e.title}</strong>
                    <small>
                      {e.location || "Raum offen"} · {e.source.name}
                    </small>
                    {e.missingFromFeed && (
                      <small className="overdue">
                        Nicht im letzten Abruf – prüfen
                      </small>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="empty">Heute stehen keine Veranstaltungen an.</p>
            )}
            <div className="materials">
              <span>▤</span>
              <h3>Platz für neues Wissen</h3>
              <p>
                Lernmaterialien erscheinen hier, sobald ein lokaler oder
                freigegebener Adapter ergänzt wird.
              </p>
              <span className="pill">In einer späteren Version</span>
            </div>
          </section>
        </div>
        <section id="courses" className="card">
          <div className="section-heading">
            <h2>Deine Module</h2>
            <span className="muted">{courses.length} Module</span>
          </div>
          <div className="course-grid">
            {courses.map((c) => (
              <details className="course" key={c.id}>
                <summary>
                  <i style={{ background: c.color }} />
                  <strong>{c.title}</strong>
                  <small>{c.code} · Bearbeiten</small>
                </summary>
                <form action={mutate}>
                  <Hidden name="action" value="course" />
                  <Hidden name="id" value={c.id} />
                  <label>
                    Titel
                    <input
                      required
                      name="title"
                      defaultValue={c.title}
                      maxLength={160}
                    />
                  </label>
                  <label>
                    Kürzel
                    <input name="code" defaultValue={c.code} />
                  </label>
                  <label>
                    Farbe
                    <input type="color" name="color" defaultValue={c.color} />
                  </label>
                  <Submit />
                </form>
                <form action={mutate}>
                  <Hidden name="action" value="deleteCourse" />
                  <Hidden name="id" value={c.id} />
                  <button className="danger">
                    Modul löschen (Zuordnungen werden entfernt)
                  </button>
                </form>
              </details>
            ))}
          </div>
          <details>
            <summary>＋ Modul anlegen</summary>
            <form action={mutate} className="form-grid">
              <Hidden name="action" value="course" />
              <label>
                Modultitel
                <input name="title" required maxLength={160} />
              </label>
              <label>
                Kürzel
                <input name="code" maxLength={40} />
              </label>
              <label>
                Farbe
                <input type="color" name="color" defaultValue="#0f766e" />
              </label>
              <Submit>Modul anlegen</Submit>
            </form>
          </details>
        </section>
        <div className="two-col">
          <section className="card" id="event-form">
            <h2>Veranstaltung erfassen</h2>
            <form action={mutate} className="form-grid">
              <Hidden name="action" value="event" />
              <label>
                Titel
                <input name="title" required maxLength={200} />
              </label>
              {courseSelect()}
              <label>
                Beginn (Berlin)
                <input type="datetime-local" name="start" required />
              </label>
              <label>
                Ende (Berlin)
                <input type="datetime-local" name="end" required />
              </label>
              <label>
                Raum
                <input name="location" />
              </label>
              <Submit>Termin speichern</Submit>
            </form>
          </section>
          <section className="card">
            <h2>Aufgabe oder Klausur anlegen</h2>
            <form action={mutate} className="form-grid">
              <Hidden name="action" value="item" />
              <label>
                Art
                <select name="kind">
                  <option value="task">Aufgabe / Abgabe</option>
                  <option value="exam">Klausur</option>
                </select>
              </label>
              <label>
                Titel
                <input name="title" required maxLength={200} />
              </label>
              {courseSelect()}
              <label>
                Fälligkeit (Berlin)
                <input name="dueAt" type="datetime-local" required />
              </label>
              <label>
                Beschreibung
                <textarea name="description" maxLength={5000} />
              </label>
              <label>
                Vorwarnung
                <select name="reminderMinutes">
                  <option value="">Keine</option>
                  <option value="60">1 Stunde vorher</option>
                  <option value="1440">1 Tag vorher</option>
                  <option value="10080">1 Woche vorher</option>
                </select>
              </label>
              <Submit />
            </form>
          </section>
        </div>
        <section className="card" id="import">
          <h2>ICS-Kalender importieren</h2>
          <p className="muted">
            Wähle eine lokale Datei. Dieselbe Quellenkennung ersetzt beim
            erneuten Import alle bisherigen Termine dieser Quelle – auch
            außerhalb des neuen Zeitraums. Das Enddatum ist exklusiv.
          </p>
          <form action={mutate} className="form-grid">
            <Hidden name="action" value="import" />
            <label>
              Stabile Quellenkennung
              <input
                name="source"
                placeholder="z. B. mein-stundenplan"
                required
                maxLength={80}
              />
            </label>
            <label>
              ICS-Datei (max. 2 MB)
              <input
                type="file"
                name="file"
                accept=".ics,text/calendar"
                required
              />
            </label>
            <label>
              Ab
              <input
                name="from"
                type="date"
                defaultValue={now.startOf("year").toISODate()!}
                required
              />
            </label>
            <label>
              Bis (max. zwei Jahre)
              <input
                name="to"
                type="date"
                defaultValue={now
                  .startOf("year")
                  .plus({ years: 1 })
                  .toISODate()!}
                required
              />
            </label>
            {courseSelect()}
            <Submit>Importieren</Submit>
          </form>
          <div className="sources">
            {sources
              .filter((s) => s.kind === "ICS")
              .map((s) => (
                <small key={s.id}>
                  {s.name} · letzter Import:{" "}
                  {s.lastSyncedAt ? format(s.lastSyncedAt) : "–"}
                </small>
              ))}
          </div>
        </section>
        <section className="card" id="subscription">
          <h2>Kalender per Link abonnieren</h2>
          <p className="muted">
            Füge deinen persönlichen HTTPS-iCal-Link aus cmlife ein. Der Link
            wird verschlüsselt auf diesem Gerät gespeichert und nach dem
            Speichern nicht mehr angezeigt. Es gibt keine automatische
            Synchronisierung.
          </p>
          <form action={mutate} className="form-grid" autoComplete="off">
            <Hidden name="action" value="subscribe" />
            <label>
              Persönlicher iCal-Link
              <input
                type="password"
                name="url"
                required
                maxLength={4096}
                autoComplete="off"
                spellCheck={false}
                placeholder="https://my.uni-bayreuth.de/…"
              />
            </label>
            <label>
              Ab
              <input
                name="from"
                type="date"
                required
                defaultValue={now.startOf("year").toISODate()!}
              />
            </label>
            <label>
              Bis (exklusiv, maximal zwei Jahre)
              <input
                name="to"
                type="date"
                required
                defaultValue={now
                  .startOf("year")
                  .plus({ years: 1 })
                  .toISODate()!}
              />
            </label>
            <SubscriptionSubmit>
              Abonnieren und synchronisieren
            </SubscriptionSubmit>
          </form>
          <p className="muted">
            Erlaubt ist standardmäßig my.uni-bayreuth.de. Andere Hosts müssen
            lokal freigegeben werden. Fehlende oder abgesagte Termine werden zur
            Prüfung markiert und bleiben erhalten. Ein erneutes Abonnieren
            desselben Links aktualisiert das bestehende Abo und seinen Zeitraum.
          </p>
          {sources
            .filter((s) => s.kind === "ICS_URL")
            .map((s, i) => (
              <div className="deadline" key={s.id}>
                <div>
                  <strong>
                    {s.name} {i + 1}
                  </strong>
                  <small>
                    Letzter erfolgreicher Abruf:{" "}
                    {s.lastSyncedAt
                      ? format(s.lastSyncedAt)
                      : "Noch nicht synchronisiert"}
                  </small>
                  <small>
                    {s.subscriptionFrom
                      ? format(s.subscriptionFrom, "dd.MM.yyyy")
                      : "–"}{" "}
                    bis{" "}
                    {s.subscriptionTo
                      ? format(s.subscriptionTo, "dd.MM.yyyy")
                      : "–"}{" "}
                    (exklusiv)
                  </small>
                </div>
                <form action={mutate}>
                  <Hidden name="action" value="syncSubscription" />
                  <Hidden name="id" value={s.id} />
                  <SubscriptionSubmit>Jetzt synchronisieren</SubscriptionSubmit>
                </form>
              </div>
            ))}
        </section>
        <section className="card">
          <h2>Aufgaben und Klausuren verwalten</h2>
          {[
            ...tasks.map((t) => ({ ...t, kind: "task" })),
            ...exams.map((t) => ({ ...t, kind: "exam", done: false })),
          ]
            .sort((a, b) => +a.dueAt - +b.dueAt)
            .map((t) => (
              <details key={t.id}>
                <summary>
                  {t.done ? "✓ " : ""}
                  {t.title}{" "}
                  <span className="muted">
                    · {format(t.dueAt)} ·{" "}
                    {t.kind === "exam" ? "Klausur" : "Aufgabe"}
                  </span>
                </summary>
                <form action={mutate} className="form-grid">
                  <Hidden name="action" value="item" />
                  <Hidden name="id" value={t.id} />
                  <Hidden name="kind" value={t.kind} />
                  <label>
                    Titel
                    <input name="title" defaultValue={t.title} required />
                  </label>
                  <label>
                    Fälligkeit
                    <input
                      name="dueAt"
                      type="datetime-local"
                      defaultValue={local(t.dueAt)}
                      required
                    />
                  </label>
                  {courseSelect(t.courseId)}
                  <label>
                    Vorwarnung in Minuten
                    <input
                      name="reminderMinutes"
                      type="number"
                      min="0"
                      max="43200"
                      defaultValue={t.reminderMinutes ?? ""}
                    />
                  </label>
                  <label>
                    Beschreibung
                    <textarea name="description" defaultValue={t.description} />
                  </label>
                  <Submit />
                </form>
                <div className="inline-actions">
                  {t.kind === "task" && (
                    <form action={mutate}>
                      <Hidden name="action" value="done" />
                      <Hidden name="id" value={t.id} />
                      <Hidden name="done" value={String(!t.done)} />
                      <button className="text-button">
                        {t.done ? "Wieder öffnen" : "Als erledigt markieren"}
                      </button>
                    </form>
                  )}
                  <form action={mutate}>
                    <Hidden name="action" value="deleteItem" />
                    <Hidden name="kind" value={t.kind} />
                    <Hidden name="id" value={t.id} />
                    <button className="danger">Löschen</button>
                  </form>
                </div>
              </details>
            ))}
        </section>
        <footer>
          StudyHub 0.1 · Für deinen Uni-Alltag gemacht.{" "}
          <span>
            Europe/Berlin · Kalenderabos werden nur manuell synchronisiert
          </span>
        </footer>
      </main>
    </div>
  );
}
