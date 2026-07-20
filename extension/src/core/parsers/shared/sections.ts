/**
 * Site-agnostic "find the heading, take the list right after it" reader for
 * job-description bodies. Foundit and Wellfound both write their description
 * as a heading (`<p><strong>Responsibilities</strong></p>` / `<h3>What
 * You'll Do</h3>`) immediately followed by a `<ul>`/`<ol>` of bullet items —
 * this reads exactly that shape and returns `[]` when it isn't found, rather
 * than guessing at unrelated content.
 */
export function extractListAfterHeading(container: Element, headingPattern: RegExp): string[] {
  const children = Array.from(container.children);

  for (let i = 0; i < children.length - 1; i++) {
    const headingText = collapse(children[i].textContent);
    if (!headingText || headingText.length > 100 || !headingPattern.test(headingText)) continue;

    const next = children[i + 1];
    if (next.tagName !== "UL" && next.tagName !== "OL") continue;

    return Array.from(next.querySelectorAll(":scope > li"))
      .map((li) => collapse(li.textContent))
      .filter((text) => text.length > 0);
  }

  return [];
}

function collapse(text: string | null): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}
