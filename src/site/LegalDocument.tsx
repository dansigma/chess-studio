import Link from "next/link";
import { LEGAL_DRAFT_BANNER, LEGAL_DRAFT_BANNER_TEXT, type LegalText } from "@/src/lib/legal/config";
import { SITE_NAME } from "@/src/site/sections";

/**
 * Static server component. Both language versions are rendered on the same page (PT-BR first,
 * English below, each with an anchor), because the site language lives in the browser
 * (localStorage) and is not available when the page is statically rendered.
 */
export function LegalDocument({ pt, en }: { pt: LegalText; en: LegalText }) {
  return (
    <div className="min-h-screen bg-studio-bg text-studio-fg">
      <header className="flex h-12 items-center border-b border-studio-border bg-studio-chrome px-4">
        <Link href="/studio" className="text-body font-semibold">
          {SITE_NAME}
        </Link>
      </header>
      {LEGAL_DRAFT_BANNER ? (
        <p
          role="note"
          className="border-b border-studio-border-strong bg-studio-warning-bg px-4 py-2 text-center text-dense font-medium text-studio-warning-fg"
        >
          {LEGAL_DRAFT_BANNER_TEXT}
        </p>
      ) : null}
      <main className="mx-auto max-w-3xl px-4 py-10">
        <nav aria-label="Idioma / Language" className="mb-8 flex gap-4 text-dense text-studio-muted">
          <a href="#pt-br" className="hover:text-studio-fg hover:underline">
            Português
          </a>
          <a href="#en" className="hover:text-studio-fg hover:underline">
            English
          </a>
          <Link href="/privacidade" className="ml-auto hover:text-studio-fg hover:underline">
            Privacidade
          </Link>
          <Link href="/termos" className="hover:text-studio-fg hover:underline">
            Termos
          </Link>
        </nav>
        <Version text={pt} id="pt-br" primary />
        <hr className="my-12 border-studio-border" />
        <Version text={en} id="en" />
      </main>
    </div>
  );
}

function Version({ text, id, primary = false }: { text: LegalText; id: string; primary?: boolean }) {
  const Heading = primary ? "h1" : "h2";
  return (
    <article id={id} lang={text.lang} className="scroll-mt-4">
      <Heading className="text-2xl font-semibold tracking-tight">{text.title}</Heading>
      <p className="mt-1.5 text-dense text-studio-muted">{text.updated}</p>
      {text.intro.map((paragraph) => (
        <p key={paragraph} className="mt-4 text-body leading-relaxed text-studio-fg">
          {paragraph}
        </p>
      ))}
      {text.sections.map((section) => (
        <section key={section.id} id={`${id}-${section.id}`} className="mt-8 scroll-mt-4">
          <h3 className="text-lg font-semibold">{section.title}</h3>
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="mt-3 text-body leading-relaxed text-studio-muted">
              {paragraph}
            </p>
          ))}
          {section.items ? (
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-body leading-relaxed text-studio-muted">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {section.after?.map((paragraph) => (
            <p key={paragraph} className="mt-3 text-body leading-relaxed text-studio-muted">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
