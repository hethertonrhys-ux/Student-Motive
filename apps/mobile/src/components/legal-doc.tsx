import type { ReactNode } from "react";
import { MailLink } from "@/components/landing";
import { B, H2, Li, P, ProsePage } from "@/components/prose-page";

// One of the documents in src/content/legal (privacy, terms, guidelines),
// drawn as a page of text. The documents are written in a small, simple
// format (see src/content/legal/README.md): "## " headings, "- " bullets,
// blank lines between paragraphs, **bold**, and email addresses as links.
export function LegalDoc({ title, updated, text }: { title: string; updated: string; text: string }) {
  return (
    <ProsePage title={title} updated={updated}>
      {blocks(text).map((b, i) => (b.kind === "h2" ? <H2 key={i}>{b.text}</H2> : b.kind === "li" ? <Li key={i}>{inline(b.text)}</Li> : <P key={i}>{inline(b.text)}</P>))}
    </ProsePage>
  );
}

type Block = { kind: "h2" | "li" | "p"; text: string };

function blocks(text: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) flush();
    else if (line.startsWith("## ")) {
      flush();
      out.push({ kind: "h2", text: line.slice(3) });
    } else if (line.startsWith("- ")) {
      flush();
      out.push({ kind: "li", text: line.slice(2) });
    } else para.push(line);
  }
  flush();
  return out;
}

// **bold** and email addresses inside a paragraph or bullet.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <B key={i}>{part.slice(2, -2)}</B>;
    if (/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(part)) return <MailLink key={i} email={part} />;
    return part;
  });
}
