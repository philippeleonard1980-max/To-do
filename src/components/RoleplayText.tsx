/**
 * Renders roleplay prose: *action* runs become italics, everything else stays
 * literal text. Deliberately not a markdown renderer — character output is
 * untrusted, and this never produces HTML from it.
 */
export function RoleplayText({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/);

  return (
    <>
      {paragraphs.map((paragraph, pIndex) => (
        <p key={pIndex}>
          {paragraph.split(/(\*[^*\n]+\*)/g).map((part, index) =>
            part.startsWith("*") && part.endsWith("*") && part.length > 2 ? (
              <em key={index}>{part.slice(1, -1)}</em>
            ) : (
              <span key={index}>{part}</span>
            ),
          )}
        </p>
      ))}
    </>
  );
}
