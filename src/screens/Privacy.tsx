import { Link } from "react-router";
import { SUPPORT_EMAIL, supportMailto } from "../../shared/contact.ts";

/**
 * What Tally keeps, said plainly.
 *
 * There was no privacy page at all, which is a gap with two different costs. The small one is that
 * Apple will not accept an App Store submission without a policy at a public URL, so the app
 * needed a page to point at. The larger one is that a pool asks people for a name and then quietly
 * keeps their picks forever, and never said so anywhere.
 *
 * Every claim here is checked against the schema rather than written from the usual template, and
 * the list is short because the app genuinely collects very little: there is no email address, no
 * password, no analytics, no advertising and no third party to hand anything to. Where something
 * *is* kept — an IP address as a rate-limit key, an Apple push token — it says so and says why.
 *
 * The contact line is `shared/contact.ts`, a plain constant. It was a build-time variable first,
 * which was wrong twice over: `.env` is gitignored, so every production build would have read it
 * as undefined and shipped this page with no way to reach anybody — and a support address is
 * published on purpose anyway. Apple asks for one at submission.
 */
export function Privacy() {
  const updated = "19 September 2026";

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <header>
        <p className="font-display text-xs font-extrabold uppercase tracking-[0.16em] text-turf">The short version</p>
        <h1 className="font-display mt-1 text-3xl font-extrabold tracking-tight lg:text-4xl">Privacy</h1>
        <p className="mt-2 text-base leading-snug text-ink-2">
          Tally keeps the name you chose, the picks you made and enough to sign your device back in. There is no email
          address, no password, no analytics and no advertising, and nothing is sold or handed to anyone.
        </p>
        <p className="mt-2 text-xs font-bold uppercase tracking-wider text-ink-3">Last updated {updated}</p>
      </header>

      <div className="mt-8 space-y-6">
        <Section title="What Tally stores">
          <Item term="Your name">
            The one you typed when you joined, or the one a commissioner typed for you. You choose it, so choose what
            you are happy having on a scoreboard your pool can see. You can change it from Account.
          </Item>
          <Item term="Your picks">
            Which teams you picked, the confidence you put behind each one, and when you last changed them. They stay
            for the season and the seasons after it — a pool is a record, and last year's board is most of the point.
          </Item>
          <Item term="A sign-in code, and one row per device">
            Your code proves a name is yours on a new device. Device tokens are stored only as a SHA-256 hash, so
            nobody reading the database can sign in as you — not another player, and not whoever runs Tally.
          </Item>
          <Item term="Face ID, if you switch it on">
            A passkey is a public key stored on the server and a private key that never leaves your phone's secure
            enclave. Tally never sees your face or your fingerprint; iOS only tells it that you unlocked.
          </Item>
          <Item term="A push token, if you allow notifications">
            Apple's identifier for one install, so a message about your pool can reach it. Deleting the app, or turning
            notifications off, ends it.
          </Item>
          <Item term="Your IP address, briefly">
            Used as the key for rate limiting on sign-up and join attempts, so one person cannot flood a pool. The row
            expires on its own and is not used for anything else.
          </Item>
        </Section>

        <Section title="What Tally does not do">
          <Item term="No analytics, no tracking, no advertising">
            There is no analytics SDK, no advertising SDK, no tracking pixel and no third-party script in the app or on
            the site. Nothing follows you off Tally.
          </Item>
          <Item term="No selling, no sharing">
            Your data is not sold, rented or handed to anybody. Tally has no data partners to hand it to.
          </Item>
          <Item term="No email, no phone number, no address">
            Tally never asks. A sign-in link is one you send yourself.
          </Item>
        </Section>

        <Section title="Who can see what">
          <Item term="Your pool">
            Everyone in a pool can see every name on the board, and each week's picks once that game has kicked off. A
            pick stays private until its own kickoff, which is the whole reason picks are worth making.
          </Item>
          <Item term="Your commissioner">
            Whoever runs your pool can see the roster, rename or remove a player, and export the board. They cannot see
            your code or sign in as you.
          </Item>
          <Item term="Where it lives">
            On Cloudflare, in a Cloudflare D1 database, served by a Cloudflare Worker. Cloudflare is the only company
            other than Tally that touches it, as the host.
          </Item>
        </Section>

        <Section title="Children">
          <Item term="Family entries">
            A parent can add entries for their kids and pick on their behalf. Such an entry is a name and its picks and
            nothing else — no account, no code, no device of its own — and it is managed entirely from the parent's
            account.
          </Item>
        </Section>

        <Section title="Removing yourself">
          <Item term="Signing out">
            Signing out clears this device only. Your picks stay on the board.
          </Item>
          <Item term="Deleting everything">
            Ask your commissioner to remove you. Removing a player deletes that player, their picks, their devices and
            any entries they manage. It cannot be undone. If the pool is gone or your commissioner is not reachable,
            write to the address below and it will be done for you.
          </Item>
        </Section>

        <Section title="Getting in touch">
          <Item term="Questions about any of this, or anything else">
            <a className="underline decoration-2 underline-offset-2" href={supportMailto("Tally privacy")}>
              {SUPPORT_EMAIL}
            </a>
          </Item>
        </Section>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        <Link className="btn" to="/">
          Back to the pool
        </Link>
        <Link className="btn" to="/rules">
          How scoring works
        </Link>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="font-display text-xl font-extrabold tracking-tight">{title}</h2>
      <dl className="mt-3 space-y-3">{children}</dl>
    </section>
  );
}

function Item({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-display text-sm font-extrabold">{term}</dt>
      <dd className="mt-0.5 text-sm leading-snug text-ink-2">{children}</dd>
    </div>
  );
}
