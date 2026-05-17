export function Highlighted({ text }: { text: string }) {
  const chunks = text.split('#')
  return (
    <>
      {chunks.map((c, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="hl">
            {c}
          </mark>
        ) : (
          <span key={i}>{c}</span>
        ),
      )}
    </>
  )
}
